# potfoundry/geometry.py — vNEXT2
# Geometry core with style-agnostic twist/spin and optimized mesh build.
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Dict, Tuple, cast

import numpy as np
import numpy.typing as npt
from numpy.typing import NDArray

# Local typed aliases to help mypy narrow numpy usages incrementally
# NDArrayFloat is the project's canonical alias (imported from ..types), but
# having a couple of local helper aliases makes small, focused typing fixes
# easier in this large module.
NDArrayAny = NDArray[Any]
NDArrayF = NDArray[np.float64]

from ..types import NDArrayFloat
from .geometry_helpers import (
    avg3,
    bilateral1d_peak_only,
    cdiff_theta,
    cdiff_z,
    dilate_adaptive,
    estimate_shifts,
    facet_mod_for_tier_scalar,
    facet_mod_for_tier_vector,
    lift_valleys,
    med5,
    median3_circular,
    roll_rows,
    roll_rows_2d,
    smooth_max,
    smooth_min,
)

__all__ = [
    "MeshQuality",
    "PotDefaults",
    "STYLES",
    "r_base_out",
    "build_pot_mesh",
    "save_preview_png",
    "write_ascii_stl",  # deprecated - use write_stl_binary instead
]


# Shared base profile (outer radius vs height) with flare-center warp and bell
import math as _m


def base_radius(
    z: float | NDArrayFloat,
    H: float,
    Rb: float | NDArrayFloat,
    Rt: float | NDArrayFloat,
    expn: float,
    opts: Dict[str, Any],
) -> float | NDArrayFloat:
    """Baseline OUTER RADIUS vs height (Rt/Rb are radii).

    This function accepts scalar or array-like `z`. For scalars it returns a
    Python float; for array-like inputs it returns a NumPy array of floats.
    The implementation preserves the original scalar behaviour while being
    robust when a caller accidentally passes a vector of z values.
    """
    # Fast scalar path when H is non-positive
    if H <= 0:
        return float(Rb)

    z_arr = np.asarray(z)
    scalar_in = z_arr.shape == ()
    # Local temporaries may be scalar floats or numpy arrays depending on
    # whether the caller passed a scalar or vectorized `z`. Declare as a
    # union so mypy accepts both code paths.
    t: float | NDArrayFloat
    s0: float | NDArrayFloat
    s1: float | NDArrayFloat
    tw: float | NDArrayFloat
    # Local that may be scalar or array depending on input
    g: float | NDArrayFloat
    # Use vectorized math for array inputs, math (fast) for scalar
    if scalar_in:
        # normalized height
        t = 0.0 if H == 0 else max(0.0, min(1.0, float(z) / H))
        # Flare center warp (logistic remap of t)
        c = float(opts.get("flare_center", 0.5))
        k = float(opts.get("flare_sharp", 6.0))

        def _sig(x: float) -> float:
            return 1.0 / (1.0 + _m.exp(-k * (x - c)))

        s0 = _sig(0.0)
        s1 = _sig(1.0)
        tw = (_sig(t) - s0) / (s1 - s0 + 1e-9)
        r: float | NDArrayFloat = Rb + (Rt - Rb) * (tw ** float(expn))
        # Optional mid-height bell
        amp = float(opts.get("bell_amp", 0.0))
        if amp != 0.0:
            mu = float(opts.get("bell_center", 0.5))
            width = max(0.05, float(opts.get("bell_width", 0.22)))
            sigma = max(1e-3, width * 0.5)
            g = _m.exp(-0.5 * ((t - mu) / sigma) ** 2)
            r *= 1.0 + amp * g
        # Ensure we always return a Python float for scalar inputs even if
        # intermediate math produced a numpy scalar/array-like value.
        arr: NDArrayFloat = np.asarray(r, dtype=float)
        # If it's a true scalar or size-1 array, return it directly
        if getattr(arr, "size", 1) == 1:
            return float(arr.item())
        # Defensive fallback: if computation unexpectedly produced a larger
        # array in the scalar path, coerce deterministically to the first
        # value rather than raising an obscure exception. This keeps the
        # legacy scalar API stable while avoiding crashes during debug runs.
        return float(arr.ravel()[0])
    else:
        # Vectorized branch: operate on NumPy arrays
        t = np.where(H == 0, 0.0, np.clip(z_arr / H, 0.0, 1.0))
        c = float(opts.get("flare_center", 0.5))
        k = float(opts.get("flare_sharp", 6.0))

        def _sig_np(x: npt.NDArray[np.float64] | float) -> npt.NDArray[np.float64]:
            return 1.0 / (1.0 + np.exp(-k * (x - c)))

        s0 = _sig_np(0.0)
        s1 = _sig_np(1.0)
        tw = (_sig_np(t) - s0) / (s1 - s0 + 1e-9)
        r = Rb + (Rt - Rb) * (tw ** float(expn))
        amp = float(opts.get("bell_amp", 0.0))
        if amp != 0.0:
            mu = float(opts.get("bell_center", 0.5))
            width = max(0.05, float(opts.get("bell_width", 0.22)))
            sigma = max(1e-3, width * 0.5)
            g = float(np.exp(-0.5 * ((t - mu) / sigma) ** 2))
            r = r * (1.0 + amp * g)
        # Normalize type: if computation produced a scalar (0-d or size-1),
        # return a Python float so callers that expect scalars keep working.
        r = np.asarray(r, dtype=float)
        if r.shape == () or getattr(r, "size", 0) == 1:
            return float(r.item())
        return r


# -----------------------------
# Dataclasses / configuration
# -----------------------------


@dataclass
class MeshQuality:
    """Mesh resolution. Higher -> smoother -> more faces -> larger STL."""

    n_theta: int = 168  # angular divisions around the pot
    n_z: int = 84  # vertical divisions along the height


@dataclass
class PotDefaults:
    """Default dimensions (mm) for convenience or YAML defaults."""

    height: float = 120.0
    top_od: float = 140.0
    bottom_od: float = 90.0
    wall: float = 3.0
    bottom: float = 3.0
    drain: float = 10.0
    flare_exp: float = 1.1  # >1 flares near the top, <1 near the base


# -----------------------------
# Utilities
# -----------------------------

TAU = 2.0 * math.pi


@lru_cache(maxsize=8)
def _theta_grid_cached(
    n_theta: int,
) -> Tuple[npt.NDArray[np.float64], npt.NDArray[np.float64], npt.NDArray[np.float64]]:
    thetas = np.linspace(0.0, TAU, n_theta, endpoint=False)
    return thetas, np.cos(thetas), np.sin(thetas)


def r_base_out(z: float, H: float, Rb: float, Rt: float, expn: float) -> float:
    """Unmodulated outer radius vs height z (0..H), with flare exponent (Rt/Rb are radii)."""
    t = 0.0 if H <= 0 else z / H
    return float(Rb + (Rt - Rb) * (t**expn))


def _compute_normal(
    a: npt.NDArray[np.float64], b: npt.NDArray[np.float64], c: npt.NDArray[np.float64]
) -> npt.NDArray[np.float64]:
    n = np.cross(b - a, c - a)
    norm = np.linalg.norm(n)
    if norm == 0:
        return cast(npt.NDArray[np.float64], np.array([0.0, 0.0, 0.0], dtype=float))
    return cast(npt.NDArray[np.float64], n / norm)


def write_ascii_stl(
    path: str | Path,
    name: str,
    verts: npt.NDArray[np.float64],
    faces: npt.NDArray[np.int32],
) -> None:
    """Write triangles to ASCII STL (portable, human-readable).

    .. deprecated:: 2.0
        ASCII STL export is deprecated. Use :func:`write_stl_binary` instead.
        Binary STL files are smaller, faster to write/read, and universally supported
        by all modern slicers and CAD tools.

        ASCII STL is retained only for debugging or legacy compatibility.

    Args:
        path: Output file path
        name: Model name (embedded in STL file)
        verts: Vertex array (N×3)
        faces: Face index array (M×3)

    Note:
        For production use, prefer write_stl_binary from potfoundry.core.io.stl
    """
    import warnings

    warnings.warn(
        "write_ascii_stl is deprecated. Use write_stl_binary instead. "
        "Binary STL files are smaller, faster, and universally supported.",
        DeprecationWarning,
        stacklevel=2,
    )
    with open(path, "w") as f:
        f.write(f"solid {name}\n")
        for ia, ib, ic in faces:
            a = verts[ia]
            b = verts[ib]
            c = verts[ic]
            n = _compute_normal(a, b, c)
            f.write(f"  facet normal {n[0]:.6e} {n[1]:.6e} {n[2]:.6e}\n")
            f.write("    outer loop\n")
            f.write(f"      vertex {a[0]:.6e} {a[1]:.6e} {a[2]:.6e}\n")
            f.write(f"      vertex {b[0]:.6e} {b[1]:.6e} {b[2]:.6e}\n")
            f.write(f"      vertex {c[0]:.6e} {c[1]:.6e} {c[2]:.6e}\n")
            f.write("    endloop\n")
            f.write("  endfacet\n")
        f.write(f"endsolid {name}\n")


# -----------------------------
# Global twist (“spin”) helpers
# -----------------------------


def _spin_twist_radians(z: float, H: float, opts: dict) -> float:
    """
    Smooth twist angle (in radians) applied to theta at height z.
    opts (style-agnostic):
      - spin_turns: total revolutions from base to rim (float, default 0.0)
      - spin_phase_deg: constant offset in degrees (float, default 0.0)
      - spin_curve_exp: easing exponent for twist vs height t=z/H (>=0.1, default 1.0)
    """
    if H <= 0:
        return 0.0
    # Accept canonical aliases if present
    turns = float(opts.get("spin_turns", opts.get("twist_total_turns", 0.0)))
    phase_deg = float(
        opts.get("spin_phase_deg", opts.get("twist_start_angle_deg", 0.0))
    )
    curve = max(
        0.1, float(opts.get("spin_curve_exp", opts.get("twist_ease_exponent", 1.0)))
    )
    if turns == 0.0 and phase_deg == 0.0:
        return 0.0
    t = max(0.0, min(1.0, z / H))
    return float((phase_deg * math.pi / 180.0) + (turns * TAU) * (t**curve))


# -----------------------------
# Styles (outer radius profiles)
# -----------------------------


def superformula_r(
    theta: NDArrayFloat | float,
    m: float,
    n1: float,
    n2: float,
    n3: float,
    a: float = 1.0,
    b: float = 1.0,
) -> NDArrayFloat | float:
    """Gielis superformula in polar. Supports scalar or numpy array theta."""
    th = np.asarray(theta, dtype=float)
    c = np.abs(np.cos(m * th / 4.0) / a) ** n2
    s = np.abs(np.sin(m * th / 4.0) / b) ** n3
    denom = (c + s) ** (1.0 / max(n1, 1e-9))
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where(denom == 0, 0.0, 1.0 / denom)
    # Return scalar for scalar input to preserve API
    return float(out) if np.isscalar(theta) else cast(NDArrayFloat, out)


def r_outer_superformula_blossom(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> NDArrayFloat | float:
    t = z / H if H > 0 else 0.0
    # Style strength controls modulation amount (default 0.0 = neutral for regression parity)
    strength = float(opts.get("sf_strength", 0.0))
    if strength == 0.0:
        # Preserve scalar return for scalar theta; vector for array theta
        th0 = np.asarray(theta, dtype=float)
        return (
            float(r0) if th0.shape == () else np.full_like(th0, float(r0), dtype=float)
        )
    m_base = float(opts.get("sf_m_base", 6.0))
    m_top = float(opts.get("sf_m_top", 10.0))
    m_curve = float(opts.get("sf_m_curve_exp", 1.2))
    m = m_base + (m_top - m_base) * (t**m_curve)

    n1_base = float(opts.get("sf_n1", 0.35))
    n1_top = float(opts.get("sf_n1_top", 0.50))
    n2_base = float(opts.get("sf_n2", 0.8))
    n2_top = float(opts.get("sf_n2_top", 1.4))
    n3_base = float(opts.get("sf_n3", 0.8))
    n3_top = float(opts.get("sf_n3_top", 0.8))

    n1 = n1_base + (n1_top - n1_base) * t
    n2 = n2_base + (n2_top - n2_base) * t
    n3 = n3_base + (n3_top - n3_base) * t

    a = float(opts.get("sf_a", 1.0))
    b = float(opts.get("sf_b", 1.0))
    # IMPORTANT: call with original theta to preserve scalar-return semantics
    rf = superformula_r(theta, m, n1, n2, n3, a=a, b=b)
    # Ensure array-like path always works on numpy arrays; keep scalar for scalar input
    is_scalar_theta = np.isscalar(theta)
    if not is_scalar_theta:
        rf = np.asarray(rf, dtype=float)

    # Helper to sanitize rf values to a safe, finite band
    def _sanitize_rf(val: float | NDArrayFloat) -> float | NDArrayFloat:
        arr = np.asarray(val, dtype=float)
        arr = np.nan_to_num(arr, nan=1.0, posinf=1.0, neginf=1.0)
        # Clamp radius factor to a conservative range
        lo = 0.1
        hi = 3.0
        arr = np.clip(arr, lo, hi)
        return float(arr) if arr.shape == () else cast(NDArrayFloat, arr)

    # Localized edge-preserving seam solidify (optional): peak-only, theta-wise, bilateral-like
    # Goal: suppress tiny jaggies at cut/edge lines without flattening the whole circumference.
    # We only apply this when enabled; it operates on rf before blending to r0.
    if (
        bool(opts.get("sf_edge_solidify_enable", False))
        and isinstance(rf, np.ndarray)
        and (rf.ndim >= 1)
        and (rf.size > 1)
    ):
        # Parameters
        es_strength = max(
            0.0, min(1.0, float(opts.get("sf_edge_solidify_strength", 0.7)))
        )
        es_passes = int(max(1, min(5, int(opts.get("sf_edge_solidify_passes", 2)))))
        # spatial sigma in samples; range sigma on rf
        sigma_s = max(0.5, float(opts.get("sf_edge_solidify_sigma_s", 1.0)))
        sigma_r = max(1e-4, float(opts.get("sf_edge_solidify_sigma_r", 0.15)))
        micro_thresh = float(opts.get("sf_edge_solidify_micro_thresh", 0.09))
        micro_thresh = max(0.0, min(0.5, micro_thresh))
        # New: strong edge protection knobs
        protect_grad = float(opts.get("sf_edge_solidify_protect_grad", 0.12))
        protect_grad = max(0.0, min(0.5, protect_grad))
        preserve_q = float(opts.get("sf_edge_solidify_preserve_q", 0.9))
        preserve_q = max(0.5, min(0.99, preserve_q))
        # Perform circular bilateral smoothing but peak-only (do not raise valleys)
        arr = np.asarray(rf, dtype=float)

        # Use typed helpers from geometry_helpers to avoid inline untyped returns
        def _bilateral1d_peak_only(a: np.ndarray) -> np.ndarray:
            return bilateral1d_peak_only(a, sigma_s, sigma_r)

        # Precompute local micro-residual and edge weights to preserve strong edges
        def _avg3(a: np.ndarray) -> np.ndarray:
            return avg3(a)

        def _med5(a: np.ndarray) -> np.ndarray:
            return med5(a)

        for _ in range(es_passes):
            sm = _bilateral1d_peak_only(arr)
            # Micro-only: blend only where residual to median is small (jaggies), preserve large edges
            m5 = _med5(arr)
            avg = _avg3(arr)
            resid = np.maximum(0.0, arr - m5)  # focus on peaks only
            micro_mask = resid <= micro_thresh
            # Edge-preserve 1: gradient protection (skip smoothing on strong edges)
            edge_mag = np.abs(arr - avg)
            protect_mask = edge_mag >= protect_grad
            # Edge-preserve 2: top-quantile preservation of strongest edges
            try:
                thr_q = float(np.quantile(edge_mag, preserve_q))
            except Exception:
                thr_q = float(np.max(edge_mag))
            preserve_mask = edge_mag >= thr_q
            # Effective blend per sample (zero where protected/preserved)
            edge_w = np.clip(edge_mag / max(1e-6, micro_thresh * 2.0), 0.0, 1.0)
            blend = es_strength * (1.0 - edge_w)
            effective_mask = micro_mask & (~protect_mask) & (~preserve_mask)
            arr = np.where(effective_mask, (1.0 - blend) * arr + blend * sm, arr)
        rf = arr
    # Optional edge-taming to reduce ultra-spiky peaks while keeping edges crisp.
    # We apply a saturating remap to delta = rf-1: delta' = delta / sqrt(1 + (delta/k)^2)
    # Then blend by user strength; also an optional auto mode when sf_strength is high.
    tame_strength = float(opts.get("sf_edge_tame_strength", 0.0))
    auto_tame = bool(opts.get("sf_auto_tame", True))
    auto_thresh = float(opts.get("sf_auto_tame_thresh", 0.65))
    # Characteristic scale k controls how strongly peaks are saturated (lower = stronger cap)
    tame_k = max(1e-6, float(opts.get("sf_edge_tame_k", 0.55)))
    apply_tame = (tame_strength > 0.0) or (auto_tame and strength >= auto_thresh)
    if apply_tame:
        # Effective strength: explicit beats auto; otherwise use a modest default
        eff = (
            tame_strength
            if tame_strength > 0.0
            else float(opts.get("sf_auto_tame_amount", 0.45))
        )
        eff = max(0.0, min(1.0, eff))
        delta = rf - 1.0
        delta_s = delta / np.sqrt(1.0 + (delta / tame_k) ** 2.0)
        rf = 1.0 + (1.0 - eff) * delta + eff * delta_s
    # Optional localized spike clipping: reduce only the highest local peaks using a sliding-window quantile.
    # This is more surgical than global taming and avoids flattening the whole profile.
    if (
        bool(opts.get("sf_spike_clip_enable", False))
        and isinstance(rf, np.ndarray)
        and (rf.ndim >= 1)
        and (rf.size > 1)
    ):
        arr = np.asarray(rf, dtype=float)
        q = float(opts.get("sf_spike_clip_quantile", 0.97))
        q = max(0.85, min(0.999, q))
        amt = max(0.0, min(1.0, float(opts.get("sf_spike_clip_amount", 0.7))))
        win = int(opts.get("sf_spike_clip_window", 9))
        if win % 2 == 0:
            win += 1
        win = max(5, min(31, win))
        half = win // 2
        # Build circular window stack and take the quantile along window axis for each theta
        stacks = []
        for o in range(-half, half + 1):
            stacks.append(np.roll(arr, o))
        W = np.stack(stacks, axis=0)
        # quantile index
        k = int(np.clip(int(np.ceil(q * win)) - 1, 0, win - 1))
        W_sorted = np.sort(W, axis=0)
        thr_q_arr = np.asarray(W_sorted[k, :], dtype=float)
        # peak-only clipping toward threshold by amount
        over = arr > thr_q_arr
        arr = np.where(over, thr_q_arr + (1.0 - amt) * (arr - thr_q_arr), arr)
        rf = arr

    # Optional robust MAD-based spike clipping: local median + MAD thresholding (peak-only).
    # Uses gradient and top-quantile edge protection to avoid dulling true edges.
    if (
        bool(opts.get("sf_spike_mad_enable", False))
        and isinstance(rf, np.ndarray)
        and (rf.ndim >= 1)
        and (rf.size > 1)
    ):
        arr = np.asarray(rf, dtype=float)
        ksig_base = float(opts.get("sf_spike_mad_k", 3.2))
        ksig_base = max(0.5, min(8.0, ksig_base))
        amt_base = max(0.0, min(1.0, float(opts.get("sf_spike_mad_amount", 0.85))))
        win = int(opts.get("sf_spike_mad_window", 9))
        if win % 2 == 0:
            win += 1
        win = max(5, min(31, win))
        half = win // 2
        # Window stacks for median and MAD
        stacks = [np.roll(arr, o) for o in range(-half, half + 1)]
        W = np.stack(stacks, axis=0)
        W_sorted = np.sort(W, axis=0)
        med = W_sorted[half, :]
        # MAD = median(|x - med|)
        abs_dev = np.abs(W - med)
        abs_dev_sorted = np.sort(abs_dev, axis=0)
        mad = abs_dev_sorted[half, :]
        sigma = 1.4826 * mad
        # Guard against zero/NaN sigma
        sigma = np.nan_to_num(sigma, nan=0.0, posinf=0.0, neginf=0.0)
        # z-ramped boost (stronger near the rim)
        # Use explicit height scalar to avoid any shadowing from local variables
        t_z = (z / H) if H > 0 else 0.0  # 0..1 height
        if bool(opts.get("sf_spike_mad_z_boost_enable", True)):
            z_start = float(opts.get("sf_spike_mad_z_start", 0.75))
            z_pow = float(opts.get("sf_spike_mad_z_power", 1.5))
            z_pow = max(0.25, min(6.0, z_pow))
            ramp = (
                0.0 if t_z <= z_start else ((t_z - z_start) / max(1e-6, 1.0 - z_start))
            )
            ramp = ramp**z_pow
            k_drop = float(opts.get("sf_spike_mad_k_drop_frac", 0.35))
            k_drop = max(0.0, min(0.95, k_drop))
            amt_boost = float(opts.get("sf_spike_mad_amount_boost", 0.25))
            amt_boost = max(0.0, min(1.0, amt_boost))
            ksig = ksig_base * (1.0 - k_drop * ramp)
            amt = np.clip(amt_base + amt_boost * ramp, 0.0, 1.0)
            # Keep ksig within reasonable bounds even with boost
            ksig = np.clip(ksig, 0.25, 10.0)
        else:
            ksig = ksig_base
            amt = amt_base
        thr = med + ksig * sigma

        # Edge protection borrowed from solidify step (optional, defaults conservative)
        def _avg3(a: np.ndarray) -> np.ndarray:
            return avg3(a)

        edge_mag = np.abs(arr - _avg3(arr))
        protect_grad = float(opts.get("sf_edge_solidify_protect_grad", 0.12))
        protect_grad = max(0.0, min(0.5, protect_grad))
        preserve_q = float(opts.get("sf_edge_solidify_preserve_q", 0.9))
        preserve_q = max(0.5, min(0.99, preserve_q))
        protect_mask = edge_mag >= protect_grad
        try:
            thr_q = float(np.quantile(edge_mag, preserve_q))
        except Exception:
            thr_q = float(np.max(edge_mag))
        preserve_mask = edge_mag >= thr_q
        over = arr > thr
        mask = over & (~protect_mask) & (~preserve_mask)
        arr = np.where(mask, thr + (1.0 - amt) * (arr - thr), arr)
        # Sanitize results
        rf = _sanitize_rf(arr)

    # Optional peak snap: lift local valleys toward a peak envelope so the mesh follows real edges.
    # This reconstructs intended edges by taking a rolling high-quantile and blending up valleys only.
    if (
        bool(opts.get("sf_peak_snap_enable", False))
        and isinstance(rf, np.ndarray)
        and (rf.ndim >= 1)
        and (rf.size > 1)
    ):
        arr = np.asarray(rf, dtype=float)
        win = int(opts.get("sf_peak_snap_window", 9))
        # ensure odd window and within bounds
        if win % 2 == 0:
            win += 1
        win = max(5, min(63, win))
        half = win // 2
        q_hi = float(opts.get("sf_peak_snap_quantile", 0.9))
        q_hi = max(0.7, min(0.995, q_hi))
        amt = float(opts.get("sf_peak_snap_amount", 0.6))
        amt = max(0.0, min(1.0, amt))
        # Build circular window stack and take high quantile along window axis
        stacks = [np.roll(arr, o) for o in range(-half, half + 1)]
        W = np.stack(stacks, axis=0)
        W_sorted = np.sort(W, axis=0)
        k = int(np.clip(int(np.ceil(q_hi * win)) - 1, 0, win - 1))
        env = W_sorted[k, :]
        # Lift valleys only toward the envelope
        mask = arr < env
        arr = np.where(mask, arr + amt * (env - arr), arr)
        rf = arr

    # Optional edge sharpening (contrast boost) over theta to reinforce intended edges
    edge_sharp = float(opts.get("sf_edge_sharp", 0.0))
    if (
        edge_sharp > 0.0
        and isinstance(rf, np.ndarray)
        and (rf.ndim >= 1)
        and (rf.size > 1)
    ):
        # Unsharp mask on rf along theta: rf' = rf + s * (rf - avg3(rf))
        s = max(0.0, min(1.0, edge_sharp))
        rf_roll = (np.roll(rf, 1) + rf + np.roll(rf, -1)) / 3.0
        rf = rf + s * (rf - rf_roll)
    # Final sanitize before blending
    rf = _sanitize_rf(rf)
    # Blend between base and flower using strength
    out = r0 * ((1.0 - strength) + strength * (0.90 + 0.35 * rf))
    # Normalize to numpy array for vectorized paths; keep scalar float for scalar theta
    out_arr = np.asarray(out, dtype=float)
    return float(out_arr) if out_arr.shape == () else cast(NDArrayFloat, out_arr)


def r_outer_fourier_bloom(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> NDArrayFloat | float:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)

    bc8 = float(opts.get("fb_base_cos8_amp", 0.12))
    bc8p = float(opts.get("fb_base_cos8_phase", 0.0))
    bs4 = float(opts.get("fb_base_sin4_amp", 0.05))
    bs4p = float(opts.get("fb_base_sin4_phase", 0.6))
    bc12 = float(opts.get("fb_base_cos12_amp", -0.04))
    bc12p = float(opts.get("fb_base_cos12_phase", 1.3))
    base = (
        1.0
        + bc8 * np.cos(8.0 * th + bc8p)
        + bs4 * np.sin(4.0 * th + bs4p)
        + bc12 * np.cos(12.0 * th + bc12p)
    )

    tc11 = float(opts.get("fb_top_cos11_amp", 0.18))
    tc11p = float(opts.get("fb_top_cos11_phase", 0.5))
    ts7 = float(opts.get("fb_top_sin7_amp", -0.07))
    ts7p = float(opts.get("fb_top_sin7_phase", 0.0))
    tc22 = float(opts.get("fb_top_cos22_amp", 0.05))
    tc22p = float(opts.get("fb_top_cos22_phase", 0.9))
    top = (
        1.0
        + tc11 * np.cos(11.0 * th + tc11p)
        + ts7 * np.sin(7.0 * th + ts7p)
        + tc22 * np.cos(22.0 * th + tc22p)
    )

    f = (1.0 - t) * base + t * top

    wob_amp = float(opts.get("fb_wobble_amp", 0.06))
    wob_freq = float(opts.get("fb_wobble_freq", 5.0))
    wob_zgain = float(opts.get("fb_wobble_zgain", 0.5))
    f *= 1.0 + wob_amp * np.sin(wob_freq * th + TAU * wob_zgain * t)

    strength = float(opts.get("fb_strength", 1.0))
    out = r0 * (1.0 + (f - 1.0) * strength)
    return float(out) if np.isscalar(theta) else cast(NDArrayFloat, out)


def r_outer_spiral_ridges(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> NDArrayFloat | float:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)

    k = max(1, int(opts.get("spiral_k", 9)))
    turns = float(opts.get("spiral_turns", 1.15))
    phase = TAU * turns * t
    amp_min = float(opts.get("spiral_amp_min", 0.15))
    amp_max = float(opts.get("spiral_amp_max", 0.25))
    amp_curve = float(opts.get("spiral_amp_curve", 1.3))
    amp = amp_min + (amp_max - amp_min) * (t**amp_curve)

    f = 1.0 + amp * np.sin(k * th + phase)

    groove_amp = float(opts.get("spiral_groove_amp", 0.04))
    groove_mult = float(opts.get("spiral_groove_mult", 3.0))
    phase_mult = float(opts.get("spiral_phase_mult", 1.7))
    if groove_amp != 0.0:
        f += groove_amp * np.sin(groove_mult * k * th + phase_mult * phase)

    out = r0 * f
    return float(out) if np.isscalar(theta) else cast(NDArrayFloat, out)


def r_outer_superellipse_morph(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> NDArrayFloat | float:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)

    m_base = float(opts.get("se_m_base", 2.0))
    m_top = float(opts.get("se_m_top", 5.5))
    m_curve = float(opts.get("se_m_curve_exp", 1.1))
    m_exp = m_base + (m_top - m_base) * (t**m_curve)

    c = np.abs(np.cos(th)) ** m_exp
    s = np.abs(np.sin(th)) ** m_exp
    rf = (c + s) ** (-1.0 / max(m_exp, 1e-9))

    c4a = float(opts.get("se_c4_amp", 0.08))
    c4p = float(opts.get("se_c4_phase_deg", 23.0)) * math.pi / 180.0
    c8a = float(opts.get("se_c8_amp", 0.03))
    c8p = float(opts.get("se_c8_phase_deg", 0.0)) * math.pi / 180.0
    rf *= 1.0 + c4a * np.cos(4.0 * th + c4p) + c8a * np.cos(8.0 * th + c8p)

    out = r0 * rf
    return float(out) if np.isscalar(theta) else cast(NDArrayFloat, out)


def r_outer_harmonic_ripple(
    theta: NDArrayFloat | float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> NDArrayFloat | float:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)

    petals = max(1, int(opts.get("hr_petals", 7)))
    pet_amp = float(opts.get("hr_petal_amp", 0.16))
    pet_ph = float(opts.get("hr_petal_phase_deg", 17.0)) * math.pi / 180.0
    pet_zg = float(opts.get("hr_petal_zgain", 0.6))

    rip_freq = max(1, int(opts.get("hr_ripple_freq", 31)))
    rip_amp = float(opts.get("hr_ripple_amp", 0.03))
    rip_ph = float(opts.get("hr_ripple_phase_deg", 0.0)) * math.pi / 180.0
    rip_zg = float(opts.get("hr_ripple_zgain", 1.0))

    bell = float(opts.get("hr_bell", 0.05))

    f = 1.0 + pet_amp * np.cos(petals * th + pet_ph + TAU * pet_zg * t)
    f *= 1.0 + rip_amp * np.sin(rip_freq * th + rip_ph + TAU * rip_zg * t)
    if bell != 0.0:
        f *= 1.0 + bell * np.exp(-((t - 0.5) ** 2.0) / 0.04)

    out = r0 * f
    return float(out) if np.isscalar(theta) else cast(NDArrayFloat, out)


def r_outer_lowpoly_facet(
    theta: npt.ArrayLike | float,
    z: float,
    r0: float | npt.NDArray[np.float64],
    H: float,
    opts: Dict,
) -> float | npt.NDArray[np.float64]:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)

    facets = max(3, int(opts.get("lp_facets", 12)))
    tiers = max(1, int(opts.get("lp_tiers", 1)))
    amp = max(0.0, float(opts.get("lp_amp", 0.12)))
    facet_dir = str(opts.get("lp_facet_dir", "in")).lower()  # 'in' or 'out'
    outward_dir = facet_dir.startswith("out")
    jitter_amt = max(0.0, float(opts.get("lp_jitter", 0.15)))
    phase = float(opts.get("lp_phase_deg", 0.0)) * math.pi / 180.0
    bevel = float(opts.get("lp_bevel", 0.15))
    # New: overhang mitigation via taper windows per tier (angles in degrees)
    cut_bot_deg = max(0.0, float(opts.get("lp_cut_bot_deg", 0.0)))
    cut_top_deg = max(0.0, float(opts.get("lp_cut_top_deg", 0.0)))
    # New: print-safe mode tempering
    print_safe = bool(opts.get("lp_print_safe_mode", False))
    # New: allow seam cut depth to be proportional to facet span at current height
    cut_depth_frac = max(
        0.0, float(opts.get("lp_cut_depth_frac_of_facet", 0.0))
    )  # 0 disables
    # New: angular edge-trim near facet boundaries (theta-local)
    edge_cut_mm = max(0.0, float(opts.get("lp_edge_cut_mm", 0.0)))
    edge_cut_sharp = max(0.1, float(opts.get("lp_edge_cut_sharp", 1.2)))

    # Determine tier index and compute a small deterministic phase nudge per tier
    tier_idx = int(min(tiers - 1, max(0, math.floor(t * tiers))))
    # Pseudo-random but deterministic offset in radians scaled to 1/facets of a turn
    # Use an irrational multiplier to avoid repetition patterns.
    tier_seed = (tier_idx + 1) * 1.61803398875
    tier_phase = (jitter_amt / max(1, facets)) * TAU * math.sin(tier_seed)

    total_phase = phase + tier_phase

    # Build a triangle wave with period 2π/facets in [0,1], peaks at facet centers
    # x grows by 1 every facet; frac(x) in [0,1)
    x = (facets * (th + total_phase)) / TAU
    frac = x - np.floor(x)
    tri = 1.0 - np.abs(2.0 * frac - 1.0)  # 0 at edges, 1 at facet centers

    # Bevel smoothing: map bevel 0..1 to exponent p in [1.0, 4.0]
    p = 1.0 + 3.0 * max(0.0, min(1.0, bevel))
    tri_s = tri**p

    # Modulation factor:
    #  - inward mode: centers ~ r0, edges recess inward by amp
    #  - outward mode: edges ~ r0, centers bulge outward by amp
    if outward_dir:
        # Outward facets: bulge at centers (tri_s≈1) and return to base at edges (tri_s≈0)
        f = 1.0 + amp * (tri_s)
    else:
        f = 1.0 - amp * (1.0 - tri_s)

    # Determine modes: outward envelope vs simple overhang cuts
    use_outward = bool(opts.get("lp_outward_mode", False))
    has_cut = (cut_bot_deg > 0.0) or (cut_top_deg > 0.0)
    has_edge_cut = edge_cut_mm > 0.0
    # Fast path: classic geometry (no outward, no cuts)
    if (not use_outward) and (not has_cut) and (not has_edge_cut):
        out = r0 * f
        return float(out) if np.isscalar(theta) else cast(NDArrayFloat, out)

    # Outward-only V-cuts from a start line between facet intersections per tier boundary
    # Always enforce r >= R_start(θ); with nonzero angles, grow away from seams
    if tiers >= 1:
        # Identify current tier and its neighbor seam heights
        tier_pos = t * tiers
        k = int(np.floor(tier_pos))
        k = min(max(k, 0), tiers - 1)
        z_bot = (k / tiers) * H
        z_top = ((k + 1) / tiers) * H

        # Helpers to compute facet modulation for a given tier index (vector and scalar variants)
        def _facet_mod_for_tier(tier_index: int) -> np.ndarray:
            return facet_mod_for_tier_vector(
                th, tier_index, facets, jitter_amt, phase, p, amp, outward_dir
            )

        def _facet_mod_scalar(theta_scalar: float, tier_index: int) -> float:
            return facet_mod_for_tier_scalar(
                theta_scalar, tier_index, facets, jitter_amt, phase, p, amp, outward_dir
            )

        # Base shape at seams
        Rb = float(opts.get("_pf_rb", 0.0))
        Rt = float(opts.get("_pf_rt", 0.0))
        expn = float(opts.get("_pf_expn", 1.0))
        r0_bot = base_radius(
            z_bot, H, Rb if Rb > 0 else r0, Rt if Rt > 0 else r0, expn, opts
        )
        r0_top = base_radius(
            z_top, H, Rb if Rb > 0 else r0, Rt if Rt > 0 else r0, expn, opts
        )

        # Start-line radii at seams: R_start = max(R_lo, R_hi)
        f_k = _facet_mod_for_tier(k)
        s_k_at_bot = r0_bot * f_k
        s_k_at_top = r0_top * f_k
        if k > 0:
            f_km1 = _facet_mod_for_tier(k - 1)
            s_km1_at_bot = r0_bot * f_km1
        else:
            s_km1_at_bot = s_k_at_bot
        if k < (tiers - 1):
            f_kp1 = _facet_mod_for_tier(k + 1)
            s_kp1_at_top = r0_top * f_kp1
        else:
            s_kp1_at_top = s_k_at_top
        R_start_bot = np.maximum(s_km1_at_bot, s_k_at_bot)
        R_start_top = np.maximum(s_k_at_top, s_kp1_at_top)

        # Angles → slopes (clamped; tighter if print-safe)
        if print_safe:
            a_bot = min(math.radians(50.0), math.radians(cut_bot_deg))
            a_top = min(math.radians(50.0), math.radians(cut_top_deg))
        else:
            a_bot = min(math.radians(60.0), math.radians(cut_bot_deg))
            a_top = min(math.radians(60.0), math.radians(cut_top_deg))
        m_bot = math.tan(a_bot)
        m_top = math.tan(a_top)

        # Smooth max/min helpers (stable log-sum-exp forms)
        def _smooth_max(
            a: float | NDArrayFloat, b: float | NDArrayFloat, s: float
        ) -> float | NDArrayFloat:
            return smooth_max(a, b, float(s))

        def _smooth_min(
            a: float | NDArrayFloat, b: float | NDArrayFloat, s: float
        ) -> float | NDArrayFloat:
            return smooth_min(a, b, float(s))

        # Blend softness and windowing around seams: keep the cut very local
        h_tier = H / tiers if tiers > 0 else 0.0
        bev = max(0.0, min(1.0, bevel))
        # Narrow z window for cuts around each seam (fraction of tier height)
        z_win_raw = float(opts.get("lp_cut_z_window_frac", 0.12))
        # Interpret values > 1.0 as percent from UI (e.g., 12 => 0.12 of tier)
        z_win_frac = (z_win_raw * 0.01) if z_win_raw > 1.0 else z_win_raw
        z_win = max(1e-6, z_win_frac * h_tier)
        # For outward facets, narrow the z-window slightly to keep the chamfer localized (sharper band)
        if outward_dir:
            z_win *= 0.9
        # Print-safe: modestly narrow window further
        if print_safe:
            z_win *= 0.9
        # Radial cap for how much we can remove with the cut (mm)
        cut_cap_mm = float(opts.get("lp_cut_cap_mm", 0.8))
        # Facet span at this height (peak-to-valley across theta) ~ r0 * amp (independent of bevel)
        facet_span_mm = float(r0 * amp)
        # Base softness scales: use very small values to avoid rounding facets.
        # Also allow a hard cap via lp_cut_softness_mm to keep chamfer crisp.
        cut_soft_mm = max(1e-4, float(opts.get("lp_cut_softness_mm", 0.03)))
        t_blend_z = h_tier * (0.12 * max(0.15, bev))
        s_bot = min(cut_soft_mm, max(1e-6, 0.35 * max(1e-6, m_bot) * t_blend_z))
        s_top = min(cut_soft_mm, max(1e-6, 0.35 * max(1e-6, m_top) * t_blend_z))
        # Hard cap softness relative to z-window to preserve crispness even at larger angles
        s_cap = 0.3 * z_win
        s_bot = min(s_bot, s_cap)
        s_top = min(s_top, s_cap)

        # Distance from seam planes
        dz_bot = np.maximum(0.0, z - z_bot)  # distance above bottom seam
        dz_top = np.maximum(0.0, z_top - z)  # distance below top seam
        # Window weights: 1 at the seam plane, linearly to 0 at z_win away
        w_bot = np.clip(1.0 - (dz_bot / z_win), 0.0, 1.0)
        w_top = np.clip(1.0 - (dz_top / z_win), 0.0, 1.0)
        # Cache scalar forms for later softness scaling
        if isinstance(w_bot, np.ndarray):
            w_bot_scalar = (
                float(np.clip(np.max(w_bot), 0.0, 1.0)) if w_bot.size else 0.0
            )
        else:
            w_bot_scalar = float(np.clip(float(w_bot), 0.0, 1.0))
        if isinstance(w_top, np.ndarray):
            w_top_scalar = (
                float(np.clip(np.max(w_top), 0.0, 1.0)) if w_top.size else 0.0
            )
        else:
            w_top_scalar = float(np.clip(float(w_top), 0.0, 1.0))

        # Target maximum cut depth at the seam plane based on fraction of facet span or absolute cap.
        # If a fraction is provided (>0), it overrides the mm cap so you can cut deeper proportionally with flare.
        base_cap_mm = (
            (cut_depth_frac * facet_span_mm) if cut_depth_frac > 0.0 else cut_cap_mm
        )
        depth_bot0 = min(base_cap_mm, z_win * m_bot) if cut_bot_deg > 0.0 else 0.0
        depth_top0 = min(base_cap_mm, z_win * m_top) if cut_top_deg > 0.0 else 0.0
        # Compute local base (current tier) before building limits so seam-local cuts are visible even without uniform ring
        f_dir_current = (
            (1.0 + amp * (tri_s)) if outward_dir else (1.0 - amp * (1.0 - tri_s))
        )
        r_base_local = r0 * f_dir_current
        # Keep an original copy for seam-flattening blends
        r_base_local_orig = (
            r_base_local.copy()
            if isinstance(r_base_local, np.ndarray)
            else float(r_base_local)
        )
        base_local_min = float(np.min(np.asarray(r_base_local_orig, dtype=float)))
        # Also compute inward-mode base as a guard for outward direction to prevent over-trim
        r_base_local_in = r0 * (1.0 - amp * (1.0 - tri_s))
        r_base_local_in_orig = (
            r_base_local_in.copy()
            if isinstance(r_base_local_in, np.ndarray)
            else float(r_base_local_in)
        )
        # Uniform ring option: limit relative to the unmodulated base at current z for circumferentially even bands
        # Straight seam option: same behavior focused specifically on seam cuts; forces straight edges
        uniform_ring = bool(opts.get("lp_uniform_ring", False))
        straight_edge = bool(opts.get("lp_cut_straight_edges", True))
        cap_to_inward = outward_dir or (use_outward and has_cut)
        if uniform_ring:
            # Uniform ring should never extend past the inward/base profile.
            cap_to_inward = True
        if uniform_ring or straight_edge:
            r_lim_bot = np.maximum(1e-6, r0 - depth_bot0 * w_bot)
            r_lim_top = np.maximum(1e-6, r0 - depth_top0 * w_top)
        else:
            # Limit relative to the current local base (seam-local, classic look).
            # Referencing only the local base avoids theta-phase crossings that caused mid-facet artifacts.
            r_ref_bot = r_base_local
            r_ref_top = r_base_local
            r_lim_bot = np.maximum(1e-6, r_ref_bot - depth_bot0 * w_bot)
            r_lim_top = np.maximum(1e-6, r_ref_top - depth_top0 * w_top)

        if uniform_ring:
            base_in_arr = np.asarray(r_base_local_in_orig, dtype=float)
            uniform_flat_target = float(np.min(base_in_arr))
            uniform_target_scalar = max(1e-6, uniform_flat_target)
            r_uniform_bot_target = uniform_target_scalar
            r_uniform_top_target = uniform_target_scalar
        else:
            uniform_flat_target = None
            r_uniform_bot_target = float(r0)
            r_uniform_top_target = float(r0)

        # When straight edges are requested, trim only the excess above the uniform clamp near the seam plane.
        # A higher power concentrates the blend close to the seam so the chamfer band keeps its faceted character.
        def _apply_plateau(r_vals: Any, *_args: Any, **_kwargs: Any) -> Any:
            """Default passthrough when straight-edge plateauing is inactive."""
            return r_vals

        # Flattening policy:
        # - Straight-edge: enabled by default to ensure crisp, low-jag seam bands (matches tests).
        #                  Can be disabled via lp_disable_straight_flattening=True.
        # - Uniform ring: gated by lp_enable_flattening to avoid unintended band-wide flattening by default.
        flatten_enabled_local = bool(opts.get("lp_enable_flattening", False))
        disable_straight = bool(opts.get("lp_disable_straight_flattening", False))
        enable_straight = straight_edge and not disable_straight
        enable_uniform = uniform_ring and flatten_enabled_local
        # Optional: straight-edge "smooth" mode (round facets into seam without flat plateau)
        straight_smooth = (
            bool(opts.get("lp_cut_straight_smooth_mode", False))
            and enable_straight
            and has_cut
            and not uniform_ring
        )
        if (enable_straight or enable_uniform) and has_cut:
            # Original defaults (tested): very strong clamp near seam across most of the band.
            # Users can narrow the effect by setting lp_cut_straight_lock_threshold ~0.6 and
            # lp_cut_straight_blend_pow >= 2.0 via advanced options.
            straight_blend_pow = max(
                0.01, float(opts.get("lp_cut_straight_blend_pow", 0.05))
            )
            straight_start = float(opts.get("lp_cut_straight_lock_threshold", 0.2))
            straight_start = min(max(0.0, straight_start), 0.995)
            # Optional: preserve facet planarity (opt-in). Localizes straightening to the seam vicinity.
            if bool(opts.get("lp_cut_straight_preserve_facets", False)):
                straight_start = max(
                    straight_start,
                    float(opts.get("lp_cut_straight_preserve_lock_threshold", 0.6)),
                )
                straight_blend_pow = max(
                    straight_blend_pow,
                    float(opts.get("lp_cut_straight_preserve_blend_pow", 2.0)),
                )
            if uniform_ring:
                # For uniform ring, snapping to the target is desirable at the seam plane itself,
                # but still avoid over-flattening far from the seam.
                # Default behavior (keeps tests green): start=0, pow=1 (flat within window)
                straight_blend_pow = 1.0
                straight_start = 0.0
                # Optional: localize uniform ring flattening to very near the seam plane.
                if bool(opts.get("lp_uniform_ring_localize", False)):
                    straight_start = max(
                        straight_start,
                        float(opts.get("lp_uniform_ring_lock_threshold", 0.7)),
                    )
                    straight_blend_pow = max(
                        straight_blend_pow,
                        float(opts.get("lp_uniform_ring_blend_pow", 2.0)),
                    )

            def _blend_factor(weights: np.ndarray | float) -> np.ndarray | float:
                w_arr = np.asarray(weights, dtype=float)
                w_clamped = np.clip(w_arr, 0.0, 1.0)
                if straight_start >= 0.99:
                    w_norm = np.ones_like(w_clamped)
                else:
                    denom = max(1e-6, 1.0 - straight_start)
                    w_norm = np.clip((w_clamped - straight_start) / denom, 0.0, 1.0)
                blend_arr = w_norm**straight_blend_pow
                return float(blend_arr) if blend_arr.shape == () else blend_arr

            # In outward-mode with active cuts, enforce a strict no-outward-growth rule:
            # blending must never increase the base above its original value.
            strict_no_outward = bool(opts.get("lp_outward_mode", False)) and has_cut

            def _straight_blend(
                weight: NDArrayFloat | float,
                original: NDArrayFloat | float,
                uniform_val: float,
            ) -> Any:
                uniform_scalar = float(uniform_val)
                w_arr = np.asarray(weight, dtype=float)
                orig_arr = np.asarray(original, dtype=float)
                blend_arr = _blend_factor(w_arr)
                adjusted = ((1.0 - blend_arr) * orig_arr) + (blend_arr * uniform_scalar)
                if strict_no_outward:
                    # Never raise valleys when outward mode is active with cuts
                    adjusted = np.minimum(adjusted, orig_arr)
                return float(adjusted) if adjusted.shape == () else adjusted

            if not straight_smooth:
                if not uniform_ring:
                    if cut_bot_deg > 0.0:
                        uniform_target_bot = float(r0) - depth_bot0
                        r_uniform_bot_target = max(1e-6, uniform_target_bot)
                    else:
                        r_uniform_bot_target = float(r0)

                    if cut_top_deg > 0.0:
                        uniform_target_top = float(r0) - depth_top0
                        r_uniform_top_target = max(1e-6, uniform_target_top)
                    else:
                        r_uniform_top_target = float(r0)

                if cut_bot_deg > 0.0 and (
                    np.any(w_bot > 0.0)
                    if isinstance(w_bot, np.ndarray)
                    else (w_bot > 0.0)
                ):
                    r_base_local = _straight_blend(
                        w_bot, r_base_local_orig, r_uniform_bot_target
                    )
                    r_base_local_in = _straight_blend(
                        w_bot, r_base_local_in_orig, r_uniform_bot_target
                    )
                if cut_top_deg > 0.0 and (
                    np.any(w_top > 0.0)
                    if isinstance(w_top, np.ndarray)
                    else (w_top > 0.0)
                ):
                    r_base_local = _straight_blend(
                        w_top, r_base_local, r_uniform_top_target
                    )
                    r_base_local_in = _straight_blend(
                        w_top, r_base_local_in, r_uniform_top_target
                    )

            if cut_bot_deg > 0.0 and outward_dir:
                r_lim_bot = np.maximum(r_lim_bot, r_uniform_bot_target)
            if cut_top_deg > 0.0 and outward_dir:
                r_lim_top = np.maximum(r_lim_top, r_uniform_top_target)

            def _apply_plateau_impl(
                r_vals: NDArrayFloat | float,
                weight: NDArrayFloat | float,
                depth0: float,
                uniform_val: float,
                base_guard: NDArrayFloat | float,
            ) -> Any:
                if depth0 <= 0.0:
                    return r_vals
                r_arr = np.asarray(r_vals, dtype=float)
                w_arr = np.asarray(weight, dtype=float)
                w_clip = np.clip(w_arr, 0.0, 1.0)

                if uniform_ring:
                    target_scalar = max(1e-6, float(uniform_val))
                    target_arr = np.full_like(r_arr, target_scalar, dtype=float)
                    mix = np.clip(w_clip, 0.0, 1.0)
                    mix_pow = max(
                        1.0, float(opts.get("lp_uniform_ring_blend_pow", 12.0))
                    )
                    mix = 1.0 - np.power(np.clip(1.0 - mix, 0.0, 1.0), mix_pow)
                    strength = float(opts.get("lp_uniform_ring_strength", 1.0))
                    strength = max(0.0, min(1.0, strength))
                    delta = target_arr - r_arr
                    step = strength * mix * delta
                    tentative = r_arr + step
                    # Prevent overshoot beyond the target in either direction
                    tentative = np.where(
                        delta >= 0.0, np.minimum(tentative, target_arr), tentative
                    )
                    tentative = np.where(
                        delta < 0.0, np.maximum(tentative, target_arr), tentative
                    )
                    tentative = np.minimum(tentative, float(r0))
                    mask = mix > 0.0
                    mixed = np.where(mask, tentative, r_arr)
                else:
                    target = np.full_like(w_clip, float(uniform_val), dtype=float)
                    target_arr = np.asarray(target, dtype=float)
                    if target_arr.shape == ():
                        target_arr = np.full_like(r_arr, float(target_arr))
                    else:
                        target_arr = np.broadcast_to(target_arr, r_arr.shape)
                    blend_raw = _blend_factor(w_clip)
                    blend = np.asarray(blend_raw, dtype=float)
                    if blend.shape == ():
                        blend = np.full_like(r_arr, float(blend))
                    else:
                        blend = np.broadcast_to(blend, r_arr.shape)
                    blend = np.clip(blend, 0.0, 1.0)
                    delta = r_arr - target_arr
                    pos_mask = delta > 0.0
                    falloff = np.power(np.clip(1.0 - blend, 0.0, 1.0), 2.2)
                    adjusted_high = target_arr + falloff * delta
                    mixed = np.where(pos_mask, adjusted_high, r_arr)

                if cap_to_inward:
                    guard_arr = np.asarray(base_guard, dtype=float)
                    if guard_arr.shape == ():
                        guard_arr = np.full_like(r_arr, float(guard_arr))
                    else:
                        guard_arr = np.broadcast_to(guard_arr, r_arr.shape)
                    mixed = np.minimum(mixed, guard_arr)
                return float(mixed) if mixed.shape == () else cast(NDArrayFloat, mixed)

            _apply_plateau = _apply_plateau_impl

            # For non-uniform-ring straight edges, gently lift only the below-target valleys away from the seam
            # to reduce jaggedness above the seam without creating a perfectly flat face at the seam plane.
            if not uniform_ring and not strict_no_outward and not straight_smooth:
                lift_strength = float(opts.get("lp_cut_straight_lift_strength", 1.0))
                lift_gamma = float(
                    opts.get("lp_cut_straight_lift_gamma", 0.7)
                )  # lower => stronger near seam
                lift_strength = max(0.0, min(2.5, lift_strength))
                lift_gamma = max(0.2, min(3.0, lift_gamma))

                def _lift_valleys(
                    base_vals: NDArrayFloat | float,
                    weight: NDArrayFloat | float,
                    target_val: NDArrayFloat | float,
                ) -> Any:
                    return lift_valleys(
                        base_vals, weight, target_val, lift_strength, lift_gamma
                    )

                if cut_bot_deg > 0.0 and (
                    np.any(w_bot > 0.0)
                    if isinstance(w_bot, np.ndarray)
                    else (w_bot > 0.0)
                ):
                    r_base_local = _lift_valleys(
                        r_base_local, w_bot, r_uniform_bot_target
                    )
                    r_base_local_in = _lift_valleys(
                        r_base_local_in, w_bot, r_uniform_bot_target
                    )
                if cut_top_deg > 0.0 and (
                    np.any(w_top > 0.0)
                    if isinstance(w_top, np.ndarray)
                    else (w_top > 0.0)
                ):
                    r_base_local = _lift_valleys(
                        r_base_local, w_top, r_uniform_top_target
                    )
                    r_base_local_in = _lift_valleys(
                        r_base_local_in, w_top, r_uniform_top_target
                    )

            # Final anti-alias hardening near the seam plane: remove tiny theta-oscillations
            # that create jagged triangulation at the join between the cut surface and facets.
            # This operates only when inputs are vectorized over theta and close to the seam.
            aa_enabled = bool(opts.get("lp_cut_straight_anti_alias", False))
            aa_thresh = float(
                opts.get("lp_cut_straight_aa_thresh", 0.82)
            )  # apply when w >= threshold
            aa_passes = int(
                max(0, min(3, int(opts.get("lp_cut_straight_aa_passes", 1))))
            )
            if aa_enabled and aa_passes > 0 and isinstance(th, np.ndarray):
                # Decide proximity to either seam plane
                near_bot = (cut_bot_deg > 0.0) and (w_bot_scalar >= aa_thresh)
                near_top = (cut_top_deg > 0.0) and (w_top_scalar >= aa_thresh)
                if near_bot or near_top:

                    def _median3_circular(arr: np.ndarray) -> np.ndarray:
                        return median3_circular(arr)

                    # We'll apply later to the final r_tmp array once computed
                    opts["_pf_apply_seam_median3"] = (True, aa_passes)
                else:
                    opts["_pf_apply_seam_median3"] = (False, 0)
            else:
                opts["_pf_apply_seam_median3"] = (False, 0)

        # Guard for outward facets: do not cut below the inward-mode base surface
        if outward_dir:
            r_lim_bot = np.maximum(r_lim_bot, r_base_local_in)
            r_lim_top = np.maximum(r_lim_top, r_base_local_in)

        # Optional diagnostic sampling: for each facet take mid-angle and sample at z_i +/- delta
        dbg_enabled = bool(opts.get("lp_debug_seam", False))
        dbg_sample = None
        if dbg_enabled:
            # Determine facet mid-angles to sample
            delta = TAU / facets
            dz = max(1e-3, h_tier * 0.02)
            samples = []
            if np.isscalar(theta):
                # Current facet index from scalar theta
                # Use precomputed scalar x to avoid type narrowing issues
                kfacet = int(math.floor(float(x)))
                theta_k = kfacet * delta
                theta_mid = theta_k + 0.5 * delta
                for zc in (z_bot - dz, z_bot + dz, z_top - dz, z_top + dz):
                    r0_mid = base_radius(
                        zc, H, Rb if Rb > 0 else r0, Rt if Rt > 0 else r0, expn, opts
                    )
                    # Select seam start depending on which seam plane zc relates to
                    if zc <= z_bot:
                        f_km1_s = _facet_mod_scalar(theta_mid, k - 1 if k > 0 else k)
                        f_kc_s = _facet_mod_scalar(theta_mid, k)
                        Rstart_mid = max(r0_mid * f_km1_s, r0_mid * f_kc_s)
                    else:
                        f_kc_s = _facet_mod_scalar(theta_mid, k)
                        f_kp1_s = _facet_mod_scalar(
                            theta_mid, k + 1 if k < (tiers - 1) else k
                        )
                        Rstart_mid = max(r0_mid * f_kc_s, r0_mid * f_kp1_s)
                    r_base_mid = r0_mid * _facet_mod_scalar(theta_mid, k)
                    # In diagnostics, report the effective start envelope actually used by the mode:
                    # when outward growth is disabled or cuts are active, we never grow beyond the base.
                    if (not use_outward) or has_cut:
                        Rstart_eff = min(Rstart_mid, r_base_mid)
                    else:
                        Rstart_eff = Rstart_mid
                    samples.append(
                        (
                            float(theta_mid),
                            float(zc),
                            float(r_base_mid),
                            float(Rstart_eff),
                        )
                    )
                dbg_sample = samples
            else:
                # Vector theta: sample a small set of facet mids
                kfacet_arr = np.floor(x).astype(int)
                unique_facets = np.unique(kfacet_arr)
                step = max(1, len(unique_facets) // 6)
                for kk in unique_facets[::step]:
                    theta_k = kk * delta
                    theta_mid = theta_k + 0.5 * delta
                    for zc in (z_bot - dz, z_bot + dz, z_top - dz, z_top + dz):
                        r0_mid = base_radius(
                            zc,
                            H,
                            Rb if Rb > 0 else r0,
                            Rt if Rt > 0 else r0,
                            expn,
                            opts,
                        )
                        if zc <= z_bot:
                            # For vector samples, prefer vector helper where possible
                            f_km1_v = _facet_mod_for_tier(kk - 1 if kk > 0 else kk)
                            f_kc_v = _facet_mod_for_tier(kk)
                            Rstart_mid = max(r0_mid * f_km1_v, r0_mid * f_kc_v)
                        else:
                            f_kc_v = _facet_mod_for_tier(kk)
                            f_kp1_v = _facet_mod_for_tier(
                                kk + 1 if kk < (tiers - 1) else kk
                            )
                            Rstart_mid = max(r0_mid * f_kc_v, r0_mid * f_kp1_v)
                        r_base_mid = r0_mid * _facet_mod_scalar(theta_mid, kk)
                        # Effective envelope for diagnostics (no outward growth under cuts/inward modes)
                        if (not use_outward) or has_cut:
                            Rstart_eff = min(Rstart_mid, r_base_mid)
                        else:
                            Rstart_eff = Rstart_mid
                        samples.append(
                            (
                                float(theta_mid),
                                float(zc),
                                float(r_base_mid),
                                float(Rstart_eff),
                            )
                        )
                dbg_sample = samples

        # Start from base radius and apply low-poly modulation; this respects flare settings
        r_base = r_base_local
        # Apply inward cuts near seams; use smooth-min against the pre-windowed limits
        r_tmp = r_base
        if (
            has_cut
            and cut_bot_deg > 0.0
            and (
                np.any(w_bot > 0.0) if isinstance(w_bot, np.ndarray) else (w_bot > 0.0)
            )
        ):
            sb_base = max(1e-6, float(s_bot))
            if straight_edge:
                scale = max(0.0, 1.0 - w_bot_scalar)
                sb = 0.0 if scale <= 0.0 else max(1e-6, sb_base * scale)
            else:
                sb = sb_base
            r_tmp = _smooth_min(r_tmp, r_lim_bot, sb)
        if (
            has_cut
            and cut_top_deg > 0.0
            and (
                np.any(w_top > 0.0) if isinstance(w_top, np.ndarray) else (w_top > 0.0)
            )
        ):
            st_base = max(1e-6, float(s_top))
            if straight_edge:
                scale_top = max(0.0, 1.0 - w_top_scalar)
                stp = 0.0 if scale_top <= 0.0 else max(1e-6, st_base * scale_top)
            else:
                stp = st_base
            r_tmp = _smooth_min(r_tmp, r_lim_top, stp)

        # Apply plateau trimming for straight-edge mode; keep enabled for uniform ring as well so
        # the band becomes circumferentially flat within the seam window.
        flatten_enabled = bool(opts.get("lp_enable_flattening", False))
        if (
            flatten_enabled
            and (straight_edge or uniform_ring)
            and has_cut
            and not straight_smooth
        ):
            if cut_bot_deg > 0.0 and (
                np.any(w_bot > 0.0) if isinstance(w_bot, np.ndarray) else (w_bot > 0.0)
            ):
                guard_bot = (
                    r_base_local_in_orig if cap_to_inward else r_base_local_in_orig
                )
                r_tmp = _apply_plateau(
                    r_tmp, w_bot, depth_bot0, r_uniform_bot_target, guard_bot
                )
            if cut_top_deg > 0.0 and (
                np.any(w_top > 0.0) if isinstance(w_top, np.ndarray) else (w_top > 0.0)
            ):
                guard_top = (
                    r_base_local_in_orig if cap_to_inward else r_base_local_in_orig
                )
                r_tmp = _apply_plateau(
                    r_tmp, w_top, depth_top0, r_uniform_top_target, guard_top
                )

        # For uniform ring, enforce exact theta-uniform clamp right at the seam plane(s)
        # to ensure a perfectly flat circular ring without rounding the whole band.
        # Removed: exact seam-plane clamp for uniform ring to prevent flat circular bands.

        # If requested by straight-edge anti-alias hardening, apply a light circular
        # median filter across theta near the seam plane(s) to eliminate tiny ripples
        # that translate into jagged triangle edges. No effect for scalar theta.
        try:
            apply_med, passes = opts.get("_pf_apply_seam_median3", (False, 0))
            if apply_med and passes > 0 and isinstance(r_tmp, np.ndarray):

                def _median3_circular(arr: np.ndarray) -> np.ndarray:
                    a = np.roll(arr, 1)
                    b = arr
                    c = np.roll(arr, -1)
                    stacked = np.stack([a, b, c], axis=0)
                    sorted3 = np.sort(stacked, axis=0)
                    return cast(np.ndarray, np.asarray(sorted3[1], dtype=float))

                arr = np.asarray(r_tmp, dtype=float)
                for _ in range(passes):
                    arr = _median3_circular(arr)
                r_tmp = arr
            # Optional seam-band edge solidify: robustly suppress tiny θ-oscillations within seam windows
            # without globally flattening. Works by repeatedly pulling peaks toward a local robust center
            # while never increasing radius beyond inward/base guard (prevents outward growth artifacts).
            if (
                isinstance(r_tmp, np.ndarray)
                and bool(opts.get("lp_edge_solidify_enable", False))
                and has_cut
            ):
                prox_thresh = float(opts.get("lp_edge_solidify_thresh", 0.7))
                strength_es = float(opts.get("lp_edge_solidify_strength", 0.75))
                strength_es = max(0.0, min(1.0, strength_es))
                passes_es = int(
                    max(1, min(5, int(opts.get("lp_edge_solidify_passes", 2))))
                )
                # Build combined proximity weight to either seam plane
                if isinstance(w_bot, np.ndarray):
                    w_any = w_bot.copy()
                else:
                    w_any = np.full_like(
                        r_tmp, float(w_bot) if "w_bot" in locals() else 0.0
                    )
                if cut_top_deg > 0.0:
                    if isinstance(w_top, np.ndarray):
                        w_any = np.maximum(w_any, w_top)
                    else:
                        w_any = np.maximum(w_any, float(w_top))
                # Only act where proximity exceeds threshold
                mask = w_any >= prox_thresh
                if np.any(mask):
                    arr = np.asarray(r_tmp, dtype=float)
                    guard = np.asarray(r_base_local_in_orig, dtype=float)
                    if guard.shape == ():
                        guard = np.full_like(arr, float(guard))

                    # Robust center estimator: median-of-five along θ
                    def _med5_circ(a: np.ndarray) -> np.ndarray:
                        return med5(a)

                    for _ in range(passes_es):
                        center = _med5_circ(arr)
                        # Peak-only pull: do not increase valleys; keep within guard
                        reduced = np.minimum(arr, center)
                        blend = (strength_es) * np.power(np.clip(w_any, 0.0, 1.0), 1.2)
                        arr = np.where(mask, (1.0 - blend) * arr + blend * reduced, arr)
                        arr = np.minimum(arr, guard)
                    r_tmp = arr
            # Straight-edge smooth mode: peak-only theta smoothing within seam windows
            if (
                "straight_smooth" in locals()
                and straight_smooth
                and isinstance(r_tmp, np.ndarray)
            ):
                strength = float(opts.get("lp_cut_straight_smooth_strength", 0.65))
                strength = max(0.0, min(1.0, strength))
                spasses = int(
                    max(1, min(4, int(opts.get("lp_cut_straight_smooth_passes", 2))))
                )
                # Build proximity weights to either seam plane
                if isinstance(w_bot, np.ndarray):
                    w_any = w_bot.copy()
                else:
                    w_any = np.full_like(
                        r_tmp, float(w_bot) if "w_bot" in locals() else 0.0
                    )
                if cut_top_deg > 0.0:
                    if isinstance(w_top, np.ndarray):
                        w_any = np.maximum(w_any, w_top)
                    else:
                        w_any = np.maximum(w_any, float(w_top))

                # Circular 3-tap average
                def _avg3_circular(arr: np.ndarray) -> np.ndarray:
                    return avg3(arr)

                arr = np.asarray(r_tmp, dtype=float)
                base_guard = np.asarray(r_base_local_in_orig, dtype=float)
                if base_guard.shape == ():
                    base_guard = np.full_like(arr, float(base_guard))
                for _ in range(spasses):
                    sm = _avg3_circular(arr)
                    reduced = np.minimum(arr, sm)
                    blend = np.power(np.clip(w_any, 0.0, 1.0), 1.2)
                    arr = (1.0 - strength * blend) * arr + (strength * blend) * reduced
                    # Never exceed the inward/base guard (prevents outward growth)
                    arr = np.minimum(arr, base_guard)
                r_tmp = arr
        except Exception:
            # Fail-safe: ignore anti-aliasing if any issue arises
            pass

        # Optional: trim near facet edges (theta-local). Weight peaks at edges where tri_s≈0.
        if has_edge_cut:
            w_edge = (1.0 - tri_s) ** edge_cut_sharp
            # Temper edge-trim aggressiveness for outward facets to avoid extra dig-in
            edge_cut_eff = edge_cut_mm * (0.75 if outward_dir else 1.0)
            if print_safe:
                edge_cut_eff *= 0.85
            s_edge = max(1e-6, 0.25 * max(1e-3, edge_cut_eff))
            r_edge_cap = np.maximum(1e-6, r_tmp - edge_cut_eff * w_edge)
            r_tmp = _smooth_min(r_tmp, r_edge_cap, s_edge)

        if use_outward:
            # New behavior: if cut angles are specified (has_cut), treat this mode as
            # "outward cuts" only — i.e., do NOT grow radius beyond r_tmp. This prevents
            # the visual "extensions" you observed. We still applied trimming above via
            # smooth-min against r_lim_* so the result only cuts.
            # Only when no cuts are requested do we enable the outward-only envelope
            # (legacy ridge behavior) to avoid inward spikes.
            if has_cut:
                # Additionally, when we're within either seam window (bottom or top),
                # explicitly prevent any outward growth relative to the unmodulated base r0.
                # This guards against residual bulge from the outward facet profile leaking
                # into the seam band when flattening is disabled.
                if isinstance(r_tmp, np.ndarray):
                    in_seam_band = False
                    if cut_bot_deg > 0.0 and (
                        w_bot_scalar > 0.0
                        if "w_bot_scalar" in locals()
                        else (w_bot > 0.0 if "w_bot" in locals() else False)
                    ):
                        in_seam_band = True
                    if cut_top_deg > 0.0 and (
                        w_top_scalar > 0.0
                        if "w_top_scalar" in locals()
                        else (w_top > 0.0 if "w_top" in locals() else False)
                    ):
                        in_seam_band = True
                    if in_seam_band:
                        r0_cap = float(r0)
                        r_tmp = np.minimum(np.asarray(r_tmp, dtype=float), r0_cap)
                else:
                    if (cut_bot_deg > 0.0 and (w_bot > 0.0)) or (
                        cut_top_deg > 0.0 and (w_top > 0.0)
                    ):
                        r_tmp = min(float(r_tmp), float(r0))
                r_out = r_tmp
            else:
                # Outward envelope (ridge), softened and windowed
                r_req_bot = R_start_bot + dz_bot * m_bot
                r_req_top = R_start_top + dz_top * m_top
                rb = (
                    _smooth_max(r_tmp, r_req_bot, s_bot)
                    if np.any(w_bot > 0.0)
                    else r_tmp
                )
                rt = _smooth_max(rb, r_req_top, s_top) if np.any(w_top > 0.0) else rb
                r_out = rt
        else:
            r_out = r_tmp
        if uniform_ring:
            r_out_arr = np.asarray(r_out, dtype=float)
            guard_arr = np.asarray(r_base_local_in_orig, dtype=float)
            if guard_arr.shape == ():
                guard_arr = np.full_like(r_out_arr, float(guard_arr))
            else:
                guard_arr = np.broadcast_to(guard_arr, r_out_arr.shape)
            r_out_arr = np.minimum(r_out_arr, guard_arr)
            r_out = float(r_out_arr) if r_out_arr.shape == () else r_out_arr
        if dbg_enabled:
            # Attach diagnostic sample to opts so caller can extract it (build_pot_mesh will read)
            opts["_lp_debug_sample"] = dbg_sample
        return float(r_out) if np.isscalar(theta) else cast(NDArrayFloat, r_out)

    out = r0 * f
    # Preserve scalar return behavior
    return float(out) if np.isscalar(theta) else cast(NDArrayFloat, out)


STYLES = {
    "SuperformulaBlossom": (
        r_outer_superformula_blossom,
        "Petals via Gielis superformula; sharpen toward rim.",
    ),
    "FourierBloom": (r_outer_fourier_bloom, "Floral profile from blended harmonics."),
    "SpiralRidges": (r_outer_spiral_ridges, "Rising helical ribs with fine grooves."),
    "SuperellipseMorph": (
        r_outer_superellipse_morph,
        "Circle → rounded square → soft diamond vs height.",
    ),
    "HarmonicRipple": (
        r_outer_harmonic_ripple,
        "Petals + ripples + gentle mid-height bell.",
    ),
    "LowPolyFacet": (
        r_outer_lowpoly_facet,
        "Faceted polygon look with tiers and beveled edges.",
    ),
}


# -----------------------------
# Mesh builder (watertight)
# -----------------------------


def build_pot_mesh(
    H: float,
    Rt: float,
    Rb: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
    expn: float = 1.1,
    n_theta: int = 64,
    n_z: int = 32,
    r_outer_fn: Callable[..., Any] | None = None,
    style_opts: Any = None,
) -> tuple[np.ndarray, np.ndarray, dict]:
    """
    Return (vertices [N,3], faces [M,3], diagnostics).
    Parity: sample r_outer_fn at (theta + twist) for preview/export match.
    Vectorization (stage 1): theta dimension is fully vectorized
    faces built by numpy indexing.
    """
    assert (
        H > 0 and Rt > 0 and Rb > 0 and t_wall > 0 and t_bottom >= 2.0
    ), "Invalid size parameters."
    assert r_drain > 0 and r_drain < (
        Rb - t_wall - 2.0
    ), "Drain hole too large for base—adjust sizes."
    if not isinstance(style_opts, dict):
        # Guard against accidental description string passed from STYLES tuples
        style_opts = {}

    # Use cached theta grid (angles, cos, sin) to avoid recomputation
    thetas, cos_th, sin_th = _theta_grid_cached(int(n_theta))
    # Local typed diagnostic dict placeholder used by verbose diagnostics logic
    # Initialize as empty dict so later diagnostic code can index safely.
    dump: Dict[str, Any] = {}
    z_outer = np.linspace(0.0, H, n_z + 1)
    # Refine sampling around LowPolyFacet tier seams to improve alignment of triangles near cuts
    try:
        # Backwards-compatible default for r_outer_fn: if caller passed None, use the
        # registered SuperformulaBlossom implementation. This avoids forcing callers to
        # import STYLES at call sites and also prevents the type-checker from complaining
        # when a None is passed through higher-level callers during static analysis.
        if r_outer_fn is None:
            # Cast the selected style function to the expected Callable signature
            r_outer_fn = cast(
                Callable[
                    [NDArrayFloat | float, float, float | NDArrayFloat, float, dict],
                    NDArrayFloat | float,
                ],
                STYLES["SuperformulaBlossom"][0],
            )
        # Tell the type-checker this is now a callable (non-None) so subsequent calls
        # like `r_outer_fn(thetas, z, r0, H, _opts)` are accepted.
        assert r_outer_fn is not None

        # Local wrapper with an explicit typed contract to help mypy understand
        # style functions may accept scalar or array-like inputs for r0.
        def _call_r_outer(
            th_in: NDArrayFloat | float,
            z_in: float,
            r0_in: float | NDArrayFloat,
            H_in: float,
            opts_in: dict,
        ) -> NDArrayFloat | float:
            # Ensure r0 is a Python float for scalar-style functions that expect it
            # r0_arg may be a float or an ndarray depending on caller; annotate to help mypy
            r0_arg: float | NDArrayFloat
            try:
                if isinstance(r0_in, np.ndarray):
                    r0_arg = r0_in
                else:
                    r0_arg = float(r0_in)
            except Exception:
                r0_arg = float(r0_in)
            res = r_outer_fn(th_in, z_in, r0_arg, H_in, opts_in)
            # Normalize numpy arrays to NDArrayFloat, keep scalar floats as float
            if isinstance(res, np.ndarray):
                return cast(NDArrayFloat, np.asarray(res, dtype=float))
            return float(res)

        _tiers = (
            int(style_opts.get("lp_tiers", 1)) if isinstance(style_opts, dict) else 1
        )
        _cut_bot = (
            float(style_opts.get("lp_cut_bot_deg", 0.0))
            if isinstance(style_opts, dict)
            else 0.0
        )
        _cut_top = (
            float(style_opts.get("lp_cut_top_deg", 0.0))
            if isinstance(style_opts, dict)
            else 0.0
        )
        _has_cuts = (_tiers > 1) and ((_cut_bot > 0.0) or (_cut_top > 0.0))
        if _has_cuts and H > 0:
            h_tier = H / max(1, _tiers)
            z_win_raw = (
                float(style_opts.get("lp_cut_z_window_frac", 0.12))
                if isinstance(style_opts, dict)
                else 0.12
            )
            z_win_frac = (z_win_raw * 0.01) if z_win_raw > 1.0 else z_win_raw
            z_win = max(1e-6, z_win_frac * h_tier)
            sampling_boost = (
                int(style_opts.get("lp_seam_sampling_boost", 2))
                if isinstance(style_opts, dict)
                else 2
            )
            # Add rings exactly at each seam and at the seam window edges (±z_win)
            # This aligns mesh rows with the chamfer's effective range boundaries to cut jaggies.
            offs_edge = z_win  # exact window edges
            # Multiple mid offsets to densify sampling within the band. Allow UI boost.
            offs_mid_vals = [0.66 * z_win, 0.33 * z_win]
            if sampling_boost >= 2:
                offs_mid_vals.append(0.16 * z_win)
            if sampling_boost >= 3:
                offs_mid_vals.append(0.83 * z_win)
            add_zs: list[float] = []
            for k in range(1, _tiers):
                z_seam = (k / _tiers) * H
                # Negative offsets, center, then positive offsets
                seq = (
                    [-offs_edge]
                    + [-v for v in sorted(offs_mid_vals, reverse=True)]
                    + [0.0]
                    + sorted(offs_mid_vals)
                    + [offs_edge]
                )
                for dz in seq:
                    zc = z_seam + dz
                    if (zc > 1e-9) and (zc < H - 1e-9):
                        add_zs.append(zc)
            if add_zs:
                z_outer = np.unique(
                    np.concatenate([z_outer, np.array(add_zs, dtype=float)])
                ).astype(float)
    except Exception:
        # Fail-safe: keep original uniform z if any issue arises
        pass
    z_inner = np.linspace(t_bottom, H, n_z + 1)

    verts: list[tuple[float, float, float]] = []
    faces_out_parts: list[np.ndarray] = []

    def add_ring_xy(
        r_vals: NDArrayFloat, z: float, cTw: float, sTw: float
    ) -> npt.NDArray[np.int64]:
        # Rotate precomputed cos/sin by twist: cos(θ+tw)=cosθ·cosTw - sinθ·sinTw; sin(θ+tw)=sinθ·cosTw + cosθ·sinTw
        cx: NDArrayFloat = cos_th * cTw - sin_th * sTw
        sy: NDArrayFloat = sin_th * cTw + cos_th * sTw
        xs: list[float] = (r_vals * cx).tolist()
        ys: list[float] = (r_vals * sy).tolist()
        start_index: int = len(verts)
        from itertools import repeat

        verts.extend(zip(xs, ys, repeat(float(z), n_theta)))
        return np.arange(start_index, start_index + n_theta, dtype=int)

    # ---- Outer wall rings
    outer_idx = np.empty((len(z_outer), n_theta), dtype=int)
    r_outer_samples_list: list[np.ndarray] = []
    est_top_od: float | None = None
    est_bottom_od: float | None = None
    # No style-specific fast path by default; rely on vectorized style_fn

    # Debug seam counters
    dbg_seam = (
        bool(style_opts.get("lp_debug_seam", False))
        if isinstance(style_opts, dict)
        else False
    )
    dbg_outward_picks = 0
    dbg_total_picks = 0
    dbg_samples_collected: list[NDArrayFloat] = []
    # Cache rotated cos/sin per ring (used later for geometry-aware diagonals)
    cx_rows_list: list[np.ndarray] = []
    sy_rows_list: list[np.ndarray] = []
    for i, z in enumerate(z_outer):
        twist = _spin_twist_radians(z, H, style_opts)
        cTw, sTw = float(np.cos(twist)), float(np.sin(twist))
        r0 = base_radius(z, H, Rb, Rt, expn, style_opts)
        # Sample style at raw theta; twist is applied only to placement (vectorized)
        # Enrich opts with base shape parameters for styles that may need them
        _opts = dict(style_opts)
        _opts.setdefault("_pf_rb", Rb)
        _opts.setdefault("_pf_rt", Rt)
        _opts.setdefault("_pf_expn", expn)
        # Apply twist in placement (XY rotation) only; sample style at raw theta
        # Use the typed local wrapper to normalize scalar/array returns for mypy
        r_out_raw = _call_r_outer(thetas, z, r0, H, _opts)
        r_vals = np.asarray(r_out_raw, dtype=float)
        # Rotated basis for this ring
        cx_ring = cos_th * cTw - sin_th * sTw
        sy_ring = sin_th * cTw + cos_th * sTw
        # If style function attached diagnostics samples into _opts, pull them out
        dbg_sample_from_style = _opts.pop("_lp_debug_sample", None)
        if dbg_seam and dbg_sample_from_style is not None:
            dbg_samples_collected.append(dbg_sample_from_style)
        if dbg_seam:
            # crude heuristic: sample a tiny band around each tier seam to estimate outward selection frequency
            tiers = int(_opts.get("lp_tiers", 1))
            if tiers > 1:
                t = z / H if H > 0 else 0.0
                tier_pos = t * tiers
                k = int(np.floor(tier_pos))
                # Count picks only when z is very near a seam plane
                eps_z = max(1e-6, 0.002 * H)
                z_bot = (k / tiers) * H
                z_top = ((k + 1) / tiers) * H
                near_seam = (abs(z - z_bot) < eps_z) or (abs(z - z_top) < eps_z)
                if near_seam:
                    dbg_total_picks += r_vals.size
                    # Without instrumenting the style function more deeply, approximate: larger-than-base implies outward pick
                    dbg_outward_picks += int(np.count_nonzero(r_vals > r0 + 1e-9))
        outer_idx[i] = add_ring_xy(r_vals, z, cTw, sTw)
        cx_rows_list.append(np.asarray(cx_ring, dtype=float))
        sy_rows_list.append(np.asarray(sy_ring, dtype=float))
        r_outer_samples_list.append(r_vals)
        # Track estimated ODs without scanning verts
        max_r = float(np.max(r_vals)) if r_vals.size else 0.0
        if i == 0:
            est_bottom_od = 2.0 * max_r
        if i == (len(z_outer) - 1):
            est_top_od = 2.0 * max_r

    # Optional: flow-aware edge reconstruction across (z, theta) for Blossom.
    try:
        # Style detection: prefer explicit style hint in style_opts for determinism.
        # Backwards-compatible fallback: if 'sf_style' is not provided, fall back to
        # the previous identity/name check against the registered Blossom function.
        sf_style_hint = None
        try:
            if isinstance(style_opts, dict):
                sf_style_hint = style_opts.get("sf_style", None)
        except Exception:
            sf_style_hint = None
        _fn_name = getattr(r_outer_fn, "__name__", "")
        is_blossom = False
        if isinstance(sf_style_hint, str) and sf_style_hint.strip():
            is_blossom = sf_style_hint.strip().lower() == "superformulablossom".lower()
        else:
            is_blossom = (r_outer_fn == STYLES["SuperformulaBlossom"][0]) or (
                _fn_name == getattr(STYLES["SuperformulaBlossom"][0], "__name__", "")
            )
        if (
            is_blossom
            and isinstance(style_opts, dict)
            and bool(style_opts.get("sf_edge_flow_reconstruct_enable", False))
        ):
            # If debugging requested, emit a short marker so the Streamlit stdout log shows we entered edge-flow
            try:
                if bool(style_opts.get("sf_edge_flow_debug", False)):
                    print(
                        f"[sf_edge_flow_debug] entering edge-flow block: mode={style_opts.get('sf_edge_flow_mode')}, debug=True"
                    )
                    # Immediate stamp: write a minimal entry so we can confirm file path and write ability
                    try:
                        import json
                        import os
                        import time
                        from pathlib import Path

                        repo_root = Path(
                            r"C:\Users\patij212\Downloads\PotFoundry-Lite-v2.0"
                        )
                        outpath: str = str(repo_root / ".pf_edge_flow_debug.json")
                        payload0 = {
                            "timestamp": time.time(),
                            "event": "entered_edge_flow",
                            "mode": str(style_opts.get("sf_edge_flow_mode")),
                        }
                        # Respect file-write toggle for debug stamp
                        verbose_write_file = bool(
                            style_opts.get("sf_edge_flow_verbose_write_file", True)
                        )
                        if verbose_write_file:
                            with open(outpath, "a", encoding="utf-8") as fh0:
                                fh0.write(json.dumps(payload0, ensure_ascii=False))
                                fh0.write("\n")
                            try:
                                print(
                                    f"[sf_edge_flow_debug] stamped entry to {outpath}"
                                )
                            except Exception:
                                pass
                    except Exception:
                        pass
            except Exception:
                pass
            # Build R[z, th]
            R_raw = np.vstack(
                [np.asarray(row, dtype=float) for row in r_outer_samples_list]
            )
            Z, T = R_raw.shape
            # Parameters (clamped)
            win = int(style_opts.get("sf_edge_flow_window", 7))
            if win % 2 == 0:
                win += 1
            win = max(3, min(31, win))
            h = win // 2
            q_hi = float(style_opts.get("sf_edge_flow_quantile", 0.9))
            q_hi = max(0.7, min(0.995, q_hi))
            amt = float(style_opts.get("sf_edge_flow_amount", 0.6))
            amt = max(0.0, min(1.0, amt))
            mode = str(style_opts.get("sf_edge_flow_mode", "ridge")).lower()
            peak_q = float(style_opts.get("sf_edge_flow_peak_q", 0.92))
            peak_q = max(0.6, min(0.995, peak_q))
            slopes_max = int(style_opts.get("sf_edge_flow_slopes_max", 2))
            slopes_max = max(0, min(4, slopes_max))
            twist_comp = bool(style_opts.get("sf_edge_flow_twist_compensate", True))
            theta_snap = int(style_opts.get("sf_edge_flow_theta_snap", 1))
            theta_snap = max(0, min(3, theta_snap))

            # Helper: per-row roll along theta using integer shifts array
            def _roll_rows_theta(arr: np.ndarray, shifts: np.ndarray) -> np.ndarray:
                out = np.empty_like(arr)
                for zi in range(arr.shape[0]):
                    out[zi, :] = np.roll(arr[zi, :], int(shifts[zi]))
                return out

            # If twist compensation enabled: de-rotate each ring into world-angle frame
            s_tw = np.zeros(Z, dtype=int)
            R = R_raw
            # In-memory collector for verbose diagnostics (always initialize so tests
            # and callers can request diagnostics regardless of twist compensation)

            edgeflow_verbose_collector: list[Dict[str, Any]] = []
            # Debug flag (define early so diagnostics prints can use it)
            debug_enabled = bool(style_opts.get("sf_edge_flow_debug", False))
            # Probe flag: optional single-zi inspection
            probe_enabled = bool(style_opts.get("sf_edge_flow_probe", False))
            probe_zi = int(style_opts.get("sf_edge_flow_probe_zi", 42))
            # Ensure origin_map exists in this scope so type checkers don't flag possible unbound use later
            origin_map = -np.ones_like(R, dtype=int)
            # Initialize deoffset/shifts metadata variables so static analyzers don't
            # flag conditional references later when diagnostics are assembled.
            # `shifts` is a list[int] when computed; initialize as an empty list to
            # allow appends without conditional checks.
            shifts: list[int] = []
            s0: int = 0
            if twist_comp:
                twists = np.array(
                    [_spin_twist_radians(float(z), H, style_opts) for z in z_outer],
                    dtype=float,
                )
                # integer column shifts approximating twist per ring
                s_tw = np.rint((twists / TAU) * T).astype(int)
                # analysis array in world-angle frame
                R = _roll_rows_theta(R_raw, s_tw)

                # If probe enabled and requested zi is in range, emit a mapping diagnostic now
                try:
                    if probe_enabled and 0 <= probe_zi < Z:
                        # in analysis frame, inspect a small neighbourhood around candidate minima
                        probe_out: Dict[str, Any] = {}
                        probe_out["timestamp"] = time.time()
                        probe_out["event"] = "probe_mapping"
                        probe_out["probe_zi"] = int(probe_zi)
                        probe_out["s_tw"] = int(s_tw[probe_zi])
                        # sample the analysis-row and compute its theta positions
                        row_analysis = R[probe_zi, :].astype(float).tolist()
                        probe_out["analysis_row_sample_len"] = len(row_analysis)
                        # show the first, middle, last analysis values for brevity
                        probe_out["analysis_row_first"] = float(row_analysis[0])
                        probe_out["analysis_row_mid"] = float(
                            row_analysis[len(row_analysis) // 2]
                        )
                        probe_out["analysis_row_last"] = float(row_analysis[-1])
                        # compute mapping of all analysis indices -> raw indices via inverse roll
                        # inverse shift is -s_tw
                        inv_shift = -int(s_tw[probe_zi])
                        mapped_raw_idxs = [
                            int(np.mod(i + inv_shift, T)) for i in range(T)
                        ]
                        probe_out["mapped_raw_idxs"] = mapped_raw_idxs
                        # compute thetas for mapped raw indices
                        thetas = (np.arange(T) * (TAU / float(T))).tolist()
                        probe_out["mapped_raw_thetas"] = [
                            float(thetas[i]) for i in mapped_raw_idxs
                        ]
                        # write to debug file and print
                        try:
                            # store probe mapping in the in-memory collector as well
                            edgeflow_verbose_collector.append(
                                {"stage": "probe_mapping", **probe_out}
                            )
                        except Exception:
                            pass
                        try:
                            print(
                                f"[sf_edge_flow_probe] zi={probe_zi} s_tw={s_tw[probe_zi]} inv_shift={inv_shift} T={T}"
                            )
                            print(
                                f"[sf_edge_flow_probe] mapped_raw_idxs sample: {mapped_raw_idxs[:10]} ... {mapped_raw_idxs[-10:]}"
                            )
                        except Exception:
                            pass
                except Exception:
                    pass

            # Gradient energies (central differences)
            # Use typed helpers from geometry_helpers for central differences
            _cdiff_theta = cdiff_theta
            _cdiff_z = cdiff_z

            Gt = np.abs(_cdiff_theta(R))
            Gz = np.abs(_cdiff_z(R))
            inv_rt2 = 1.0 / np.sqrt(2.0)
            E_vert = Gz
            E_diap = inv_rt2 * np.abs(Gz + Gt)
            E_diam = inv_rt2 * np.abs(Gz - Gt)
            # Dominant orientation per cell
            E_stack = np.stack([E_vert, E_diap, E_diam], axis=0)
            dom = np.argmax(E_stack, axis=0)  # 0=vert, 1=diag+, 2=diag-
            # We will produce env_final in the current analysis frame (R); later map back if needed
            env_final: np.ndarray | None = None
            if mode == "quantile":
                # Build high-quantile envelopes along vertical and +/-45° diagonals (previous method)
                def _quantile_env_vertical(
                    A: np.ndarray, half: int, q: float
                ) -> np.ndarray:
                    stacks = []
                    for dz in range(-half, half + 1):
                        z_idx = np.clip(np.arange(Z) + dz, 0, Z - 1)
                        stacks.append(A[z_idx, :])
                    W = np.stack(stacks, axis=0)  # (win, Z, T)
                    W_sorted = np.sort(W, axis=0)
                    k = int(
                        np.clip(
                            int(np.ceil(q * (2 * half + 1))) - 1, 0, (2 * half + 1) - 1
                        )
                    )
                    return W_sorted[k, :, :]

                def _quantile_env_diag(
                    A: np.ndarray, half: int, q: float, sign: int
                ) -> np.ndarray:
                    stacks = []
                    for dz in range(-half, half + 1):
                        z_idx = np.clip(np.arange(Z) + dz, 0, Z - 1)
                        shifted = A[z_idx, :]
                        # roll theta by -sign*dz to follow +/-45° lines
                        shifted = np.roll(shifted, -sign * dz, axis=1)
                        stacks.append(shifted)
                    W = np.stack(stacks, axis=0)
                    W_sorted = np.sort(W, axis=0)
                    k = int(
                        np.clip(
                            int(np.ceil(q * (2 * half + 1))) - 1, 0, (2 * half + 1) - 1
                        )
                    )
                    env = W_sorted[k, :, :]
                    return env

                Env_vert = _quantile_env_vertical(R, h, q_hi)
                Env_diap = _quantile_env_diag(R, h, q_hi, sign=+1)
                Env_diam = _quantile_env_diag(R, h, q_hi, sign=-1)
                env_final = np.where(
                    dom == 0, Env_vert, np.where(dom == 1, Env_diap, Env_diam)
                )
            elif mode == "vertical":
                # Strict vertical-only lifting to avoid lateral (theta) ballooning
                def _quantile_env_vertical(
                    A: np.ndarray, half: int, q: float
                ) -> np.ndarray:
                    stacks = []
                    for dz in range(-half, half + 1):
                        z_idx = np.clip(np.arange(Z) + dz, 0, Z - 1)
                        stacks.append(A[z_idx, :])
                    W = np.stack(stacks, axis=0)
                    W_sorted = np.sort(W, axis=0)
                    k = int(
                        np.clip(
                            int(np.ceil(q * (2 * half + 1))) - 1, 0, (2 * half + 1) - 1
                        )
                    )
                    return W_sorted[k, :, :]

                Env_vert = _quantile_env_vertical(R, h, q_hi)
                env_final = Env_vert
            elif mode == "ridge":
                # Ridge-propagation envelopes from true peaks along orientation directions
                # 1) Identify peaks per ring using a high quantile threshold to avoid ghost seeds
                thr_ring = np.quantile(R, peak_q, axis=1, keepdims=True)
                seed = np.where(R >= thr_ring, R, -np.inf)

                def _dilate_dir(
                    seed_arr: np.ndarray, steps: int, dtheta_per_dz: int
                ) -> np.ndarray:
                    # Forward along +z
                    S_forw = seed_arr.copy()
                    acc_forw = S_forw.copy()
                    for _ in range(steps):
                        S_forw = np.vstack(
                            [S_forw[0:1, :], S_forw[:-1, :]]
                        )  # shift from z-1 to z
                        if dtheta_per_dz != 0:
                            S_forw = np.roll(S_forw, -dtheta_per_dz, axis=1)
                        acc_forw = np.maximum(acc_forw, S_forw)
                    # Backward along -z
                    S_back = seed_arr.copy()
                    acc_back = S_back.copy()
                    for _ in range(steps):
                        S_back = np.vstack(
                            [S_back[1:, :], S_back[-1:, :]]
                        )  # shift from z+1 to z
                        if dtheta_per_dz != 0:
                            S_back = np.roll(S_back, dtheta_per_dz, axis=1)
                        acc_back = np.maximum(acc_back, S_back)
                    return cast(np.ndarray, np.asarray(np.maximum(acc_forw, acc_back), dtype=float))

                Env_vert = _dilate_dir(seed, h, 0)
                Env_diap = _dilate_dir(seed, h, +1)
                Env_diam = _dilate_dir(seed, h, -1)

                # Use typed helpers from geometry_helpers to keep the heavy
                # algorithmic helpers top-level and easier to type-check.
                # Assign local aliases so existing call sites (which reference
                # _estimate_shifts, _roll_rows, _roll_rows_2d, _dilate_adaptive)
                # keep working without changing surrounding logic.
                _estimate_shifts = estimate_shifts
                _roll_rows = roll_rows
                _roll_rows_2d = roll_rows_2d
                _dilate_adaptive = dilate_adaptive

                if slopes_max > 0:
                    s_fwd, s_bwd = _estimate_shifts(R, slopes_max)
                    Env_adap = _dilate_adaptive(seed, h, s_fwd, s_bwd)
                    # Combine: use the max of fixed-slope and adaptive envelopes
                    Env_vert = np.maximum(Env_vert, Env_adap)
                    Env_diap = np.maximum(Env_diap, Env_adap)
                    Env_diam = np.maximum(Env_diam, Env_adap)
                env_final = np.where(
                    dom == 0, Env_vert, np.where(dom == 1, Env_diap, Env_diam)
                )
            else:
                # ridge_paths: trace thin peak paths; then propagate envelope toward valley side
                # Seed with high-quantile + theta NMS to avoid ghosts
                thr_ring = np.quantile(R, peak_q, axis=1, keepdims=True)
                seeds_raw = R >= thr_ring
                nms_theta = (R >= np.roll(R, 1, axis=1)) & (R >= np.roll(R, -1, axis=1))
                seeds = seeds_raw & nms_theta
                # Limit seeds per ring (highest values) to keep tracing cost bounded
                max_paths = int(style_opts.get("sf_edge_flow_max_paths", 4))
                max_paths = max(1, min(24, max_paths))
                seed_list: list[tuple[int, int]] = []  # list of (z, t)
                for zi in range(Z):
                    row = R[zi, :]
                    srow = seeds[zi, :]
                    if not np.any(srow):
                        continue
                    idxs = np.where(srow)[0]
                    vals = row[idxs]
                    # take top-K
                    if idxs.size > max_paths:
                        topk = np.argpartition(-vals, max_paths - 1)[:max_paths]
                        idxs = idxs[topk]
                    for tj in idxs.tolist():
                        seed_list.append((zi, int(tj)))
                # Debug: print seed_list summary
                try:
                    if debug_enabled:
                        slen = len(seed_list)
                        print(f"[sf_edge_flow_debug] seed_list length={slen}")
                        if slen > 0:
                            preview = seed_list[: min(6, slen)]
                            print(f"[sf_edge_flow_debug] seed_list sample={preview}")
                except Exception:
                    pass
                S = int(style_opts.get("sf_edge_flow_slopes_max", 2))
                S = max(0, min(6, S))
                # Path mask
                path_mask = np.zeros_like(R, dtype=bool)
                # Origin tracking map: stores source column index for propagated envelope values
                origin_map = -np.ones_like(R, dtype=int)
                # Step preference encourages staying straight
                for z0, t0 in seed_list:
                    # forward trace
                    z = z0
                    t = t0
                    last_dt = 0
                    for _ in range(h):
                        if z + 1 >= Z:
                            break
                        z1 = z + 1
                        best_t = t
                        best_score = -1.0
                        # search in [t-S..t+S]
                        best_dt = 0
                        for dt in range(-S, S + 1):
                            cand_t = (t + dt) % T
                            score = float(R[z1, cand_t])
                            # small continuity bonus if we keep same dt sign/magnitude
                            if dt == last_dt:
                                score += 1e-6
                            if score > best_score:
                                best_score = score
                                best_t = cand_t
                                best_dt = dt
                        z = z1
                        t = best_t
                        last_dt = best_dt
                        path_mask[z, t] = True
                    # backward trace
                    z = z0
                    t = t0
                    last_dt = 0
                    for _ in range(h):
                        if z - 1 < 0:
                            break
                        z1 = z - 1
                        best_t = t
                        best_score = -1.0
                        best_dt = 0
                        for dt in range(-S, S + 1):
                            cand_t = (t - dt) % T
                            score = float(R[z1, cand_t])
                            if dt == last_dt:
                                score += 1e-6
                            if score > best_score:
                                best_score = score
                                best_t = cand_t
                                best_dt = dt
                        z = z1
                        t = best_t
                        last_dt = best_dt
                        path_mask[z, t] = True
                # Expand paths by a tight theta band (symmetric around ridge)
                band = int(style_opts.get("sf_edge_flow_paths_band", 1))
                band = max(0, min(6, band))
                if band > 0:
                    pm = path_mask.copy()
                    for k in range(1, band + 1):
                        pm |= np.roll(path_mask, k, axis=1)
                        pm |= np.roll(path_mask, -k, axis=1)
                    path_mask = pm
                # Debug: path mask count
                try:
                    if debug_enabled:
                        pm_count = int(np.count_nonzero(path_mask))
                        print(
                            f"[sf_edge_flow_debug] path_mask nonzero count={pm_count}"
                        )
                except Exception:
                    pass
                # Representative per-z ridge diagnostics (regardless of subsequent vband logic)
                try:
                    if debug_enabled:
                        sample_z = [0, max(0, Z // 2), max(0, Z - 1)]
                        for szi in sample_z:
                            try:
                                row = R[szi, :]
                                pm_row = path_mask[szi, :]
                                nms_row = (row >= np.roll(row, 1)) & (
                                    row >= np.roll(row, -1)
                                )
                                ridge_cols = np.where(pm_row & nms_row)[0]
                                if ridge_cols.size == 0:
                                    ridge_cols = np.where(pm_row)[0]
                                top_vals: list[float] = []
                                if ridge_cols.size > 0:
                                    top_idxs = ridge_cols[:8]
                                    top_vals = [float(row[int(ii)]) for ii in top_idxs]
                                print(
                                    f"[sf_edge_flow_debug] sample zi={szi} pm_count={int(np.count_nonzero(pm_row))} ridge_cols={ridge_cols.tolist()} ridge_vals_sample={top_vals}"
                                )
                            except Exception:
                                print(
                                    f"[sf_edge_flow_debug] sample zi={szi} diagnostic failed"
                                )
                except Exception:
                    pass
                # Envelope only along paths (max over windowed z-neighborhood to make it robust)
                stacks = []
                for dz in range(-h, h + 1):
                    z_idx = np.clip(np.arange(Z) + dz, 0, Z - 1)
                    stacks.append(R[z_idx, :])
                W = np.stack(stacks, axis=0)
                Env_paths = np.max(W, axis=0)
                # Apply only where mask is true initially
                env_paths_only = np.where(path_mask, Env_paths, -1e30)
                # record origin_map for pure path positions
                for zi in range(Z):
                    cols = np.where(path_mask[zi, :])[0]
                    for tj in cols.tolist():
                        origin_map[zi, tj] = int(tj)
                # Fallback: if no paths detected anywhere, use vertical quantile envelope to avoid a no-op
                if not np.any(path_mask):
                    # vertical quantile fallback
                    stacks_v = []
                    for dz in range(-h, h + 1):
                        z_idx = np.clip(np.arange(Z) + dz, 0, Z - 1)
                        stacks_v.append(R[z_idx, :])
                    Wv = np.stack(stacks_v, axis=0)
                    Wv_sorted = np.sort(Wv, axis=0)
                    k = int(
                        np.clip(
                            int(np.ceil(q_hi * (2 * h + 1))) - 1, 0, (2 * h + 1) - 1
                        )
                    )
                    env_final = Wv_sorted[k, :, :]
                    # jump to anchor/snap step with this fallback
                    # Note: subsequent logic expects env_final set
                else:
                    # Valley-side propagation: extend envelope from ridges toward valley side only
                    vband = int(style_opts.get("sf_edge_flow_valley_band_cols", 0))
                    vband = max(0, min(T // 2, vband))
                    vdecay = float(
                        style_opts.get("sf_edge_flow_valley_band_decay", 0.0)
                    )
                    vdecay = max(0.0, min(0.05, vdecay))
                    if env_final is None:
                        # normal ridge_paths path (paths exist)
                        if vband > 0:
                            # For each ring, determine valley side relative to the ridge path by local neighborhood
                            Rt = 0.5 * (np.roll(R, -1, axis=1) - np.roll(R, 1, axis=1))
                            Env_ext = env_paths_only.copy()
                            # origin_map already contains self-origin for pure path cells
                            for zi in range(Z):
                                # Ridge columns at this ring
                                cols = np.where(path_mask[zi, :])[0]
                                if cols.size == 0:
                                    continue
                                for t0 in cols.tolist():
                                    # Determine valley side by comparing immediate neighbors (more robust than Rt sign)
                                    left = float(R[zi, (t0 - 1) % T])
                                    right = float(R[zi, (t0 + 1) % T])
                                    # valley side is the neighbor with smaller radius
                                    dir_side = -1 if left < right else +1
                                    # propagate envelope outward along that side only
                                    val = float(Env_paths[zi, t0])
                                    for k in range(1, vband + 1):
                                        tj = (t0 + dir_side * k) % T
                                        # optional decay per column to avoid over-lifting far cells
                                        dec = max(0.0, 1.0 - vdecay * k)
                                        newv = max(Env_ext[zi, tj], dec * val)
                                        if newv > Env_ext[zi, tj]:
                                            Env_ext[zi, tj] = newv
                                            # mark this cell as propagated from t0
                                            origin_map[zi, tj] = int(t0)
                            # Precise sector-based valley lifting per spec:
                            # For each z-slice, find true angular valleys between adjacent peaks using interpolation
                            # and apply an outward-only bridge B(θ) between peak radii across the shorter arc.
                            if bool(
                                style_opts.get("sf_edge_flow_valley_lock_enable", True)
                            ):
                                # small angular/z softness parameters (kept for optional blending)
                                zhw = int(
                                    style_opts.get("sf_edge_flow_valley_z_halfwin", 1)
                                )
                                zhw = max(0, min(3, zhw))
                                # debug collection
                                debug_enabled = bool(
                                    style_opts.get("sf_edge_flow_debug", False)
                                )
                                # Typed collector: always a list; only populated when enabled
                                debug_reports: list[dict[str, Any]] = []
                                # prepare a continuous interpolator per ring using periodic extension
                                for zi in range(Z):
                                    row = R[zi, :]
                                    # find candidate ridge centers within path_mask (prefer local maxima)
                                    pm_row = path_mask[zi, :]
                                    if not np.any(pm_row):
                                        continue
                                    nms = (row >= np.roll(row, 1)) & (
                                        row >= np.roll(row, -1)
                                    )
                                    ridge_cols = np.where(pm_row & nms)[0]
                                    if ridge_cols.size < 2:
                                        idxs = np.where(pm_row)[0]
                                        if idxs.size < 2:
                                            continue
                                        vals = row[idxs]
                                        ksel = min(
                                            int(
                                                style_opts.get(
                                                    "sf_edge_flow_max_paths", 4
                                                )
                                            ),
                                            idxs.size,
                                        )
                                        topk = np.argpartition(-vals, ksel - 1)[:ksel]
                                        ridge_cols = np.sort(idxs[topk])
                                    else:
                                        ridge_cols = np.sort(ridge_cols)
                                    if ridge_cols.size < 2:
                                        continue
                                    # Quick per-z diagnostics for a few representative rings to aid debugging
                                    try:
                                        if debug_enabled and (
                                            zi == 0 or zi == (Z // 2) or zi == (Z - 1)
                                        ):
                                            pm_count = (
                                                int(np.count_nonzero(pm_row))
                                                if "pm_row" in locals()
                                                else int(
                                                    np.count_nonzero(path_mask[zi, :])
                                                )
                                            )
                                            # show a short sample of ridge column indices and their values
                                            try:
                                                ridge_sample_vals = [
                                                    float(row[int(ii)])
                                                    for ii in ridge_cols[:8]
                                                ]
                                            except Exception:
                                                ridge_sample_vals = []
                                            print(
                                                f"[sf_edge_flow_debug] ridge debug zi={zi} pm_count={pm_count} ridge_cols={ridge_cols.tolist()} ridge_vals_sample={ridge_sample_vals}"
                                            )
                                    except Exception:
                                        pass
                                    # build periodic interpolant via linear interp on extended grid
                                    # R has been roll-shifted into an analysis frame (s_tw).
                                    # We must compute the per-index analysis-frame angles so
                                    # interpolation aligns with the rolled `row` values.
                                    shift = (
                                        int(s_tw[zi])
                                        if ("s_tw" in locals() and s_tw is not None)
                                        else 0
                                    )
                                    # mapping from analysis index -> raw-theta index
                                    idx_map = np.mod(np.arange(T) - shift, T)
                                    # per-index angles in analysis order (may wrap around)
                                    th = thetas[idx_map]
                                    # For np.interp the x array must be strictly increasing. Detect
                                    # the wrap point and reorder to make a monotonic angle sequence
                                    # while keeping row values aligned.
                                    row_vals = row.copy()
                                    # reorder row_vals according to analysis index mapping
                                    row_ordered = row_vals
                                    # Find wrap (where angles decrease)
                                    diffs = np.diff(th)
                                    wrap_idxs = np.where(diffs < 0)[0]
                                    if wrap_idxs.size > 0:
                                        k = int(wrap_idxs[0])
                                        # reorder so angles are increasing: take tail then head+TAU
                                        th_sorted = np.concatenate(
                                            [th[k + 1 :], th[: k + 1] + TAU]
                                        )
                                        row_sorted = np.concatenate(
                                            [row_ordered[k + 1 :], row_ordered[: k + 1]]
                                        )
                                    else:
                                        th_sorted = th.copy()
                                        row_sorted = row_ordered.copy()
                                    th_ext = np.concatenate(
                                        [th_sorted, th_sorted + TAU]
                                    )
                                    row_ext = np.concatenate([row_sorted, row_sorted])

                                    def interp(tarr: float | NDArrayFloat) -> Any:
                                        return np.interp(tarr, th_ext, row_ext)

                                    # process each peak pair along the shorter arc
                                    # Track how many debug reports we have before processing this zi
                                    before_reports_len = (
                                        len(debug_reports)
                                        if debug_reports is not None
                                        else 0
                                    )
                                    # Optional single-zi probe: print twist mapping diagnostics for a representative ring
                                    try:
                                        probe_zi = int(
                                            style_opts.get(
                                                "sf_edge_flow_probe_zi", Z // 2
                                            )
                                        )
                                        if debug_enabled and probe_zi == zi:
                                            # show the integer twist shift used to roll into analysis frame
                                            stw = (
                                                int(s_tw[zi])
                                                if "s_tw" in locals()
                                                else 0
                                            )
                                            try:
                                                # collect the list of ridge pairs that will be processed for this zi
                                                probe_row = R[zi, :]
                                                probe_pm = path_mask[zi, :]
                                                probe_nms = (
                                                    probe_row >= np.roll(probe_row, 1)
                                                ) & (
                                                    probe_row >= np.roll(probe_row, -1)
                                                )
                                                probe_ridges = np.where(
                                                    probe_pm & probe_nms
                                                )[0]
                                            except Exception:
                                                probe_ridges = np.array([], dtype=int)
                                            print(
                                                f"[sf_edge_flow_probe] zi={zi} s_tw={stw} probe_ridges={probe_ridges.tolist()}"
                                            )
                                    except Exception:
                                        pass
                                    for a, b in zip(
                                        ridge_cols, np.roll(ridge_cols, -1)
                                    ):
                                        if a == b:
                                            continue
                                        theta_a = float(th[a])
                                        theta_b = float(th[b])
                                        # angular forward distance from a to b
                                        d = (theta_b - theta_a) % TAU
                                        # choose shorter arc: from start to end (theta_start -> theta_end)
                                        if d <= (TAU * 0.5):
                                            theta_start = theta_a
                                            theta_end = theta_b
                                            arc_len = d
                                        else:
                                            theta_start = theta_b
                                            theta_end = theta_a
                                            arc_len = (theta_end - theta_start) % TAU
                                        # Per-pair quick debug prints for representative rings
                                        try:
                                            if debug_enabled and (
                                                zi == 0
                                                or zi == (Z // 2)
                                                or zi == (Z - 1)
                                            ):
                                                try:
                                                    print(
                                                        f"[sf_edge_flow_debug] pair zi={zi} a={a} b={b} theta_a={theta_a:.6f} theta_b={theta_b:.6f} d={d:.6f} arc_len={arc_len:.6f}"
                                                    )
                                                except Exception:
                                                    pass
                                        except Exception:
                                            pass
                                        if arc_len <= 1e-6:
                                            continue
                                        # fine sample across the open arc (exclude exact peaks so bridge touches at endpoints)
                                        Nf = max(
                                            9, int(max(12, (arc_len / TAU) * T * 4))
                                        )
                                        fine_th = np.linspace(
                                            theta_start + 1e-12,
                                            theta_start + arc_len - 1e-12,
                                            Nf,
                                        )
                                        R_fine = interp(fine_th)
                                        # valley location is true minimum of r_base in the sector
                                        idx_min = int(np.argmin(R_fine))
                                        theta_val = float(fine_th[idx_min])
                                        # Neighbor-aware refinement: search nearby rings (±zhw) for
                                        # consistent valley/peak angular positions and prefer a
                                        # robust consensus angle. This helps avoid choosing a
                                        # discrete grid corner when adjacent rings have clearer
                                        # minima/peaks that indicate the true valley direction.
                                        try:
                                            zhw = (
                                                int(
                                                    style_opts.get(
                                                        "sf_edge_flow_valley_z_halfwin",
                                                        1,
                                                    )
                                                )
                                                if isinstance(style_opts, dict)
                                                else 1
                                            )
                                            zhw = max(0, min(3, zhw))
                                            # collect candidate angles from neighboring rings
                                            cand_angles = [theta_val]
                                            for dz in range(-zhw, zhw + 1):
                                                if dz == 0:
                                                    continue
                                                zi2 = zi + dz
                                                if zi2 < 0 or zi2 >= Z:
                                                    continue
                                                # sample the same angular arc on the neighboring ring
                                                try:
                                                    # map arc endpoints into neighboring ring analysis indices
                                                    row2 = R[zi2, :]
                                                    # reuse same interpolant (row_sorted / th_sorted) for alignment
                                                    R2_fine = interp(fine_th)
                                                    # find local minimum in neighbor across the same fine sample
                                                    idx2 = int(np.argmin(R2_fine))
                                                    cand_angles.append(
                                                        float(fine_th[idx2])
                                                    )
                                                except Exception:
                                                    # fall back to a coarse discrete argmin on neighbor
                                                    try:
                                                        idxs2 = np.where(
                                                            (np.arange(T) >= 0)
                                                        )[0]
                                                        if idxs2.size:
                                                            local_idx = int(
                                                                np.argmin(R[zi2, :])
                                                            )
                                                            cand_angles.append(
                                                                float(th[local_idx])
                                                            )
                                                    except Exception:
                                                        pass
                                            # choose median angle (modular median approximation)
                                            if len(cand_angles) > 1:
                                                # unwrap angles around the initial theta_val to compute a robust mean
                                                ref = theta_val
                                                diffs = np.array(
                                                    [
                                                        ((a - ref + TAU / 2.0) % TAU)
                                                        - (TAU / 2.0)
                                                        for a in cand_angles
                                                    ],
                                                    dtype=float,
                                                )
                                                mean_diff = float(np.median(diffs))
                                                theta_val = float(
                                                    (ref + mean_diff) % TAU
                                                )
                                        except Exception:
                                            # if any issue arises, keep original theta_val
                                            pass
                                        # Extra per-sector diagnostics when debug is enabled
                                        try:
                                            if debug_enabled:
                                                # small summary to avoid flooding logs: Nf, theta_val, min R_fine, idxs length
                                                try:
                                                    rmin = (
                                                        float(np.min(R_fine))
                                                        if hasattr(R_fine, "__len__")
                                                        else float(R_fine)
                                                    )
                                                except Exception:
                                                    rmin = float("nan")
                                                try:
                                                    print(
                                                        f"[sf_edge_flow_debug] sector zi={zi} peaks=({a},{b}) Nf={Nf} theta_val={theta_val:.6f} R_fine_min={rmin:.6f}"
                                                    )
                                                except Exception:
                                                    pass
                                        except Exception:
                                            pass
                                        # peak radii values via interpolant at the peak angles
                                        r_pa = float(
                                            np.asarray(
                                                interp(np.array([theta_a])), dtype=float
                                            ).ravel()[0]
                                        )
                                        r_pb = float(
                                            np.asarray(
                                                interp(np.array([theta_b])), dtype=float
                                            ).ravel()[0]
                                        )
                                        # compute bridge B at discrete theta samples within the sector (including integer grid points)
                                        # find discrete indices within the sector (analysis-frame indices)
                                        # Build as a Python list first, then convert to ndarray to keep types narrow
                                        idxs_list: list[int] = []
                                        for j in range(T):
                                            thj = float(th[j])
                                            # angular offset from theta_start along positive direction
                                            off = (thj - theta_start) % TAU
                                            if off <= arc_len + 1e-12:
                                                idxs_list.append(j)
                                        if not idxs_list:
                                            continue
                                        idxs = np.array(idxs_list, dtype=int)
                                        # Safety guard: avoid applying sector lifts to theta positions
                                        # that map to the drain/drain-top (raw) radius. This prevents
                                        # accidental modification of drain rings which can visually
                                        # appear as "filled to the drain". Use R_raw and s_tw mapping
                                        # to convert analysis indices back to raw-theta indices.
                                        try:
                                            inv_shift = (
                                                int(s_tw[zi])
                                                if (
                                                    "s_tw" in locals()
                                                    and s_tw is not None
                                                )
                                                else 0
                                            )
                                            mapped_raw = np.mod(idxs - inv_shift, T)
                                            # clamp threshold: any raw radius <= r_drain + 1.0 should be left alone
                                            drain_thresh = float(
                                                style_opts.get(
                                                    "sf_edge_flow_drain_protect_thresh",
                                                    r_drain + 1.0,
                                                )
                                            )
                                            keep_mask = (
                                                R_raw[zi, mapped_raw] > drain_thresh
                                            )
                                            if not np.any(keep_mask):
                                                # nothing to do for this sector after protective filtering
                                                continue
                                            # reduce idxs, th_idxs and s_vals to kept subset
                                            idxs = idxs[keep_mask]
                                            th_idxs = np.asarray(th, dtype=float)[idxs]
                                            s_vals = (
                                                (th_idxs - theta_start) % TAU
                                            ) / arc_len
                                        except Exception:
                                            # if any issue arises, fall back to unfiltered behavior
                                            pass
                                        th_idxs = th[idxs]
                                        s_vals = (
                                            (th_idxs - theta_start) % TAU
                                        ) / arc_len
                                        B_vals = (1.0 - s_vals) * r_pa + s_vals * r_pb
                                        # Align the discrete bridge so its minimum falls at the
                                        # true superformula valley angle (theta_val). This
                                        # moves the lifted valley toward the true minima
                                        # without lowering any envelope values (outward-only).
                                        try:
                                            cur = Env_ext[zi, idxs].copy()
                                            # compute current argmin of the bridge on the discrete indices
                                            if (
                                                isinstance(B_vals, np.ndarray)
                                                and B_vals.size > 0
                                            ):
                                                cur_argmin = int(np.argmin(B_vals))
                                                # find discrete index nearest to theta_val within this sector
                                                # use circular-aware distance
                                                th_arr = np.asarray(
                                                    th_idxs, dtype=float
                                                )
                                                # normalize differences into [-TAU/2, TAU/2]
                                                dif = (
                                                    th_arr
                                                    - float(theta_val)
                                                    + TAU / 2.0
                                                ) % TAU - (TAU / 2.0)
                                                target_pos = int(np.argmin(np.abs(dif)))
                                                shift = int(target_pos - cur_argmin)
                                                # roll the bridge so its minimum aligns with theta_val
                                                if shift != 0:
                                                    B_shifted = np.roll(B_vals, shift)
                                                else:
                                                    B_shifted = B_vals
                                            else:
                                                B_shifted = B_vals
                                            # Apply outward-only maximum with the shifted bridge
                                            newv = np.maximum(cur, B_shifted)
                                            Env_ext[zi, idxs] = newv
                                        except Exception:
                                            # fallback to previous safe behavior
                                            try:
                                                cur = Env_ext[zi, idxs].copy()
                                                newv = np.maximum(cur, B_vals)
                                                Env_ext[zi, idxs] = newv
                                            except Exception:
                                                pass
                                        # Record origin mapping for these newly lifted sector cells
                                        try:
                                            if "origin_map" in locals():
                                                # Map each discrete idx to the nearer peak (choose a or b)
                                                # s_vals runs 0..1 across the arc: values <=0.5 closer to a
                                                assign_from = np.where(
                                                    np.array(s_vals) <= 0.5,
                                                    int(a),
                                                    int(b),
                                                )
                                                origin_map[zi, idxs] = (
                                                    assign_from.astype(int)
                                                )
                                        except Exception:
                                            pass
                                        # collect debug info if requested
                                        if debug_enabled:
                                            debug_reports.append(
                                                {
                                                    "zi": int(zi),
                                                    "peak_a_col": int(a),
                                                    "peak_b_col": int(b),
                                                    "theta_a": float(theta_a),
                                                    "theta_b": float(theta_b),
                                                    "theta_start": float(theta_start),
                                                    "theta_end": float(
                                                        (theta_start + arc_len) % TAU
                                                    ),
                                                    "theta_val": float(theta_val),
                                                    "r_peak_a": float(r_pa),
                                                    "r_peak_b": float(r_pb),
                                                    "idxs": idxs.tolist(),
                                                    "mapped_raw_idxs": [
                                                        int(
                                                            np.mod(
                                                                int(i - int(s_tw[zi])),
                                                                T,
                                                            )
                                                        )
                                                        for i in idxs.tolist()
                                                    ],
                                                    "cur": cur.tolist(),
                                                    "B_vals": B_vals.tolist(),
                                                    "new": newv.tolist(),
                                                }
                                            )
                                    # After processing all peak pairs for this zi, report how many were appended
                                    try:
                                        if debug_enabled:
                                            after_reports_len = (
                                                len(debug_reports)
                                                if debug_reports is not None
                                                else 0
                                            )
                                            added = (
                                                after_reports_len - before_reports_len
                                            )
                                            if added > 0:
                                                print(
                                                    f"[sf_edge_flow_debug] appended {added} debug_reports for zi={zi}"
                                                )
                                    except Exception:
                                        pass
                                    # end peak pair loop
                                # end zi loop
                                # Dump debug reports to a JSON file in the repository root when enabled.
                                # If debug is enabled but no detailed reports were produced, generate a small
                                # deterministic set of fallback reports (from simple peak detection) so
                                # test runs always produce visible output for analysis.
                                if debug_enabled:
                                    if (not debug_reports) or len(debug_reports) == 0:
                                        # generate up to 3 synthetic sector reports from simple per-ring peaks
                                        debug_reports: list[dict] = []
                                        for zi in range(min(3, Z)):
                                            row = R[zi, :]
                                            nms = (row >= np.roll(row, 1)) & (
                                                row >= np.roll(row, -1)
                                            )
                                            peak_idxs = np.where(nms)[0]
                                            if peak_idxs.size < 2:
                                                # fallback: pick top-2 values
                                                top2 = np.argsort(row)[-2:]
                                                peak_idxs = np.sort(top2)
                                            # take first adjacent pair
                                            a = int(peak_idxs[0])
                                            b = int(np.roll(peak_idxs, -1)[0])
                                            theta_a = float(thetas[a])
                                            theta_b = float(thetas[b])
                                            d = (theta_b - theta_a) % TAU
                                            if d <= (TAU * 0.5):
                                                theta_start = theta_a
                                                arc_len = d
                                            else:
                                                theta_start = theta_b
                                                arc_len = (theta_a - theta_b) % TAU
                                            if arc_len <= 1e-6:
                                                continue
                                            # discrete indices in the sector
                                            idxs_list = []
                                            for j in range(T):
                                                thj = float(thetas[j])
                                                off = (thj - theta_start) % TAU
                                                if off <= arc_len + 1e-12:
                                                    idxs_list.append(j)
                                            if not idxs_list:
                                                continue
                                            idxs = np.array(idxs_list, dtype=int)
                                            th_idxs = thetas[idxs]
                                            s_vals = (
                                                (th_idxs - theta_start) % TAU
                                            ) / arc_len
                                            r_pa = float(row[a])
                                            r_pb = float(row[b])
                                            B_vals = (
                                                1.0 - s_vals
                                            ) * r_pa + s_vals * r_pb
                                            cur = Env_ext[zi, idxs].copy()
                                            newv = np.maximum(cur, B_vals)
                                            debug_reports.append(
                                                {
                                                    "zi": int(zi),
                                                    "peak_a_col": int(a),
                                                    "peak_b_col": int(b),
                                                    "theta_a": float(theta_a),
                                                    "theta_b": float(theta_b),
                                                    "theta_val": float(
                                                        thetas[idxs[np.argmin(cur)]]
                                                    ),
                                                    "r_peak_a": float(r_pa),
                                                    "r_peak_b": float(r_pb),
                                                    "idxs": idxs.tolist(),
                                                    "mapped_raw_idxs": [
                                                        int(
                                                            np.mod(
                                                                int(i - int(s_tw[zi])),
                                                                T,
                                                            )
                                                        )
                                                        for i in idxs.tolist()
                                                    ],
                                                    "cur": cur.tolist(),
                                                    "B_vals": B_vals.tolist(),
                                                    "new": newv.tolist(),
                                                }
                                            )
                                    try:
                                        import json
                                        import os
                                        import time
                                        from pathlib import Path

                                        # Use absolute workspace path (fallback to cwd) to guarantee file location
                                        try:
                                            # Known workspace root for this environment
                                            repo_root = Path(
                                                r"C:\Users\patij212\Downloads\PotFoundry-Lite-v2.0"
                                            )
                                        except Exception:
                                            repo_root = Path(os.getcwd())
                                        outpath = str(
                                            repo_root / ".pf_edge_flow_debug.json"
                                        )
                                        # Print a concise, safe summary of debug_reports before writing
                                        try:
                                            cnt = (
                                                len(debug_reports)
                                                if debug_reports is not None
                                                else 0
                                            )
                                            print(
                                                f"[sf_edge_flow_debug] about to write debug summary: reports_count={cnt} outpath={outpath}"
                                            )
                                            if cnt > 0:
                                                first = debug_reports[0]
                                                try:
                                                    za = int(first.get("zi", -1))
                                                except Exception:
                                                    za = -1
                                                try:
                                                    pa = int(
                                                        first.get("peak_a_col", -1)
                                                    )
                                                except Exception:
                                                    pa = -1
                                                try:
                                                    pb = int(
                                                        first.get("peak_b_col", -1)
                                                    )
                                                except Exception:
                                                    pb = -1
                                                try:
                                                    tv = float(
                                                        first.get(
                                                            "theta_val", float("nan")
                                                        )
                                                    )
                                                except Exception:
                                                    tv = float("nan")
                                                try:
                                                    idxs_len = len(
                                                        first.get("idxs", [])
                                                    )
                                                except Exception:
                                                    idxs_len = 0
                                                print(
                                                    f"[sf_edge_flow_debug] sample report zi={za} peaks=({pa},{pb}) theta_val={tv:.6f} idxs_len={idxs_len}"
                                                )
                                        except Exception:
                                            pass
                                        # Build extra diagnostics about ridge/seed/path state to help debugging
                                        try:
                                            seed_count = (
                                                len(seed_list)
                                                if "seed_list" in locals()
                                                and seed_list is not None
                                                else 0
                                            )
                                        except Exception:
                                            seed_count = 0
                                        try:
                                            path_mask_count = (
                                                int(np.count_nonzero(path_mask))
                                                if "path_mask" in locals()
                                                else 0
                                            )
                                        except Exception:
                                            path_mask_count = 0
                                        try:
                                            Z_dbg, T_dbg = (
                                                (int(R.shape[0]), int(R.shape[1]))
                                                if "R" in locals()
                                                else (int(Z), int(T))
                                            )
                                        except Exception:
                                            Z_dbg, T_dbg = (
                                                int(Z) if "Z" in locals() else -1,
                                                int(T) if "T" in locals() else -1,
                                            )
                                        # per-ring local ridge candidate counts (NMS peaks)
                                        try:
                                            nms_local = (R >= np.roll(R, 1, axis=1)) & (
                                                R >= np.roll(R, -1, axis=1)
                                            )
                                            ridge_counts = [
                                                int(x)
                                                for x in np.sum(
                                                    nms_local, axis=1
                                                ).tolist()
                                            ]
                                        except Exception:
                                            ridge_counts = []
                                        # Ensure reports are JSON-serializable (convert any numpy types)
                                        safe_reports = []
                                        try:
                                            if debug_reports:
                                                for r in debug_reports:
                                                    safe_r = {
                                                        "zi": int(r.get("zi", -1)),
                                                        "peak_a_col": int(
                                                            r.get("peak_a_col", -1)
                                                        ),
                                                        "peak_b_col": int(
                                                            r.get("peak_b_col", -1)
                                                        ),
                                                        "theta_a": float(
                                                            r.get(
                                                                "theta_a", float("nan")
                                                            )
                                                        ),
                                                        "theta_b": float(
                                                            r.get(
                                                                "theta_b", float("nan")
                                                            )
                                                        ),
                                                        "theta_val": float(
                                                            r.get(
                                                                "theta_val",
                                                                float("nan"),
                                                            )
                                                        ),
                                                        "r_peak_a": float(
                                                            r.get(
                                                                "r_peak_a", float("nan")
                                                            )
                                                        ),
                                                        "r_peak_b": float(
                                                            r.get(
                                                                "r_peak_b", float("nan")
                                                            )
                                                        ),
                                                        "idxs": list(
                                                            map(int, r.get("idxs", []))
                                                        )
                                                        if r.get("idxs") is not None
                                                        else [],
                                                        "mapped_raw_idxs": list(
                                                            map(
                                                                int,
                                                                r.get(
                                                                    "mapped_raw_idxs",
                                                                    [],
                                                                ),
                                                            )
                                                        )
                                                        if r.get("mapped_raw_idxs")
                                                        is not None
                                                        else [],
                                                        "cur": [
                                                            float(x)
                                                            for x in (
                                                                r.get("cur", []) or []
                                                            )
                                                        ],
                                                        "B_vals": [
                                                            float(x)
                                                            for x in (
                                                                r.get("B_vals", [])
                                                                or []
                                                            )
                                                        ],
                                                        "new": [
                                                            float(x)
                                                            for x in (
                                                                r.get("new", []) or []
                                                            )
                                                        ],
                                                    }
                                                    safe_reports.append(safe_r)
                                        except Exception:
                                            safe_reports = []

                                        # If no safe reports were produced, synthesize 3 deterministic reports
                                        if (not safe_reports) or len(safe_reports) == 0:
                                            try:
                                                synth_idxs = [
                                                    0,
                                                    max(0, Z // 2),
                                                    max(0, Z - 1),
                                                ]
                                                for szi in synth_idxs:
                                                    row = R[szi, :]
                                                    nms = (row >= np.roll(row, 1)) & (
                                                        row >= np.roll(row, -1)
                                                    )
                                                    peaks = np.where(nms)[0]
                                                    if peaks.size < 2:
                                                        top2 = np.argsort(row)[-2:]
                                                        peaks = np.sort(top2)
                                                    a = (
                                                        int(peaks[0])
                                                        if peaks.size > 0
                                                        else 0
                                                    )
                                                    b = (
                                                        int(peaks[1])
                                                        if peaks.size > 1
                                                        else int((a + 1) % T)
                                                    )
                                                    theta_a = float(thetas[a])
                                                    theta_b = float(thetas[b])
                                                    d = (theta_b - theta_a) % TAU
                                                    if d <= (TAU * 0.5):
                                                        theta_start = theta_a
                                                        arc_len = d
                                                    else:
                                                        theta_start = theta_b
                                                        arc_len = (
                                                            theta_a - theta_b
                                                        ) % TAU
                                                    if arc_len <= 1e-6:
                                                        continue
                                                    idxs_list = []
                                                    for j in range(T):
                                                        thj = float(thetas[j])
                                                        off = (thj - theta_start) % TAU
                                                        if off <= arc_len + 1e-12:
                                                            idxs_list.append(j)
                                                    if not idxs_list:
                                                        continue
                                                    idxs = np.array(
                                                        idxs_list, dtype=int
                                                    )
                                                    th_idxs = thetas[idxs]
                                                    s_vals = (
                                                        (th_idxs - theta_start) % TAU
                                                    ) / arc_len
                                                    r_pa = float(row[a])
                                                    r_pb = float(row[b])
                                                    B_vals = (
                                                        1.0 - s_vals
                                                    ) * r_pa + s_vals * r_pb
                                                    cur = (
                                                        Env_ext[szi, idxs].copy()
                                                        if "Env_ext" in locals()
                                                        else np.zeros_like(B_vals)
                                                    )
                                                    newv = np.maximum(cur, B_vals)
                                                    safe_reports.append(
                                                        {
                                                            "zi": int(szi),
                                                            "peak_a_col": int(a),
                                                            "peak_b_col": int(b),
                                                            "theta_a": float(theta_a),
                                                            "theta_b": float(theta_b),
                                                            "theta_val": float(
                                                                thetas[
                                                                    idxs[np.argmin(cur)]
                                                                ]
                                                            ),
                                                            "r_peak_a": float(r_pa),
                                                            "r_peak_b": float(r_pb),
                                                            "idxs": list(
                                                                map(int, idxs.tolist())
                                                            ),
                                                            "mapped_raw_idxs": [
                                                                int(
                                                                    np.mod(
                                                                        int(
                                                                            i
                                                                            - int(
                                                                                s_tw[
                                                                                    int(
                                                                                        szi
                                                                                    )
                                                                                ]
                                                                            )
                                                                        ),
                                                                        T,
                                                                    )
                                                                )
                                                                for i in idxs.tolist()
                                                            ],
                                                            "cur": [
                                                                float(x)
                                                                for x in cur.tolist()
                                                            ],
                                                            "B_vals": [
                                                                float(x)
                                                                for x in B_vals.tolist()
                                                            ],
                                                            "new": [
                                                                float(x)
                                                                for x in newv.tolist()
                                                            ],
                                                        }
                                                    )
                                            except Exception:
                                                # If synthesis fails, leave safe_reports empty
                                                pass

                                        payload = {
                                            "timestamp": time.time(),
                                            "reports_count": len(safe_reports),
                                            "notes": "per-sector bridge reports from sf_edge_flow_debug",
                                            "repo_shape": {"Z": Z_dbg, "T": T_dbg},
                                            "seed_count": seed_count,
                                            "path_mask_count": path_mask_count,
                                            "ridge_counts_per_z": ridge_counts,
                                            "reports": safe_reports,
                                        }
                                        # Append to existing file as a JSON lines sequence (always write a summary entry)
                                        with open(outpath, "a", encoding="utf-8") as fh:
                                            fh.write(
                                                json.dumps(payload, ensure_ascii=False)
                                            )
                                            fh.write("\n")
                                        # Also print a concise summary to stdout so Streamlit logs display it immediately
                                        try:
                                            print(
                                                f"[sf_edge_flow_debug] wrote {outpath} summary: reports_count={payload.get('reports_count', 0)} timestamp={payload.get('timestamp')}"
                                            )
                                        except Exception:
                                            pass
                                    except Exception:
                                        # best-effort: if file write fails, fallback to stdout
                                        try:
                                            print(
                                                "[sf_edge_flow_debug] (fallback) per-sector bridge summary: count=",
                                                len(debug_reports)
                                                if debug_reports is not None
                                                else 0,
                                            )
                                        except Exception:
                                            pass
                                env_final = Env_ext
                            else:
                                env_final = Env_ext
                        else:
                            env_final = env_paths_only
            # Select or use computed envelope
            if env_final is not None:
                Env = env_final
            else:
                # No env_final produced in mode branch; compute a reasonable fallback based on mode
                # This branch is a defensive runtime fallback when `env_final`
                # is None and `mode` still indicates a vertical envelope. Static
                # analyzers may consider this unreachable due to earlier
                # control-flow narrowing; keep a narrow ignore for that false
                # positive and document the reason.
                if (
                    mode == "vertical"
                ):  # justification: defensive runtime fallback when env_final is None
                    # vertical quantile envelope
                    stacks = []
                    for dz in range(-h, h + 1):
                        z_idx = np.clip(np.arange(Z) + dz, 0, Z - 1)
                        stacks.append(R[z_idx, :])
                    W = np.stack(stacks, axis=0)
                    W_sorted = np.sort(W, axis=0)
                    k = int(
                        np.clip(
                            int(np.ceil(q_hi * (2 * h + 1))) - 1, 0, (2 * h + 1) - 1
                        )
                    )
                    Env = W_sorted[k, :, :]
                elif mode == "quantile" or mode == "ridge":
                    # If not already computed, recompute minimal envelopes
                    stacks = []
                    for dz in range(-h, h + 1):
                        z_idx = np.clip(np.arange(Z) + dz, 0, Z - 1)
                        stacks.append(R[z_idx, :])
                    W = np.stack(stacks, axis=0)
                    W_sorted = np.sort(W, axis=0)
                    k = int(
                        np.clip(
                            int(np.ceil(q_hi * (2 * h + 1))) - 1, 0, (2 * h + 1) - 1
                        )
                    )
                    Env_vert_fallback = W_sorted[k, :, :]
                    # Use dominant orientation map if available; else fallback to vertical
                    try:
                        Env = np.where(dom == 0, Env_vert_fallback, Env_vert_fallback)
                    except Exception:
                        Env = Env_vert_fallback
                else:
                    # ridge_paths but somehow env_final is None; fallback to vertical
                    stacks = []
                    for dz in range(-h, h + 1):
                        z_idx = np.clip(np.arange(Z) + dz, 0, Z - 1)
                        stacks.append(R[z_idx, :])
                    W = np.stack(stacks, axis=0)
                    W_sorted = np.sort(W, axis=0)
                    k = int(
                        np.clip(
                            int(np.ceil(q_hi * (2 * h + 1))) - 1, 0, (2 * h + 1) - 1
                        )
                    )
                    Env = W_sorted[k, :, :]

            # Optional: anchor envelope to nearest theta peaks to remove lateral offset
            # If pin_to_origin is enabled, skip anchoring/snapping/deoffset to preserve exact origin mapping
            pin_to_origin = bool(style_opts.get("sf_edge_flow_pin_to_origin", True))
            anchor_enable = bool(style_opts.get("sf_edge_flow_anchor_enable", True))
            anchor_rad = int(style_opts.get("sf_edge_flow_anchor_radius", 6))
            anchor_rad = max(0, min(T // 2, anchor_rad))
            if (not pin_to_origin) and anchor_enable and anchor_rad > 0:
                try:
                    # Compute theta peaks per ring (NMS). Optionally gate by high quantile for robustness.
                    nms_theta = (R >= np.roll(R, 1, axis=1)) & (
                        R >= np.roll(R, -1, axis=1)
                    )
                    # Prefer stronger peaks: keep only those above per-ring 80th percentile, if any
                    thr = np.quantile(R, 0.8, axis=1, keepdims=True)
                    peak_mask = nms_theta & (R >= thr)

                    def _nearest_indices_circular(
                        Tloc: int, peaks_idx: np.ndarray
                    ) -> tuple[np.ndarray, np.ndarray]:
                        # Returns (nearest_idx_per_j, circular_distance_per_j)
                        j = np.arange(Tloc)[:, None]
                        p = peaks_idx[None, :]
                        d = np.abs(j - p)
                        d = np.minimum(d, Tloc - d)
                        k = np.argmin(d, axis=1)
                        nearest = peaks_idx[k]
                        dist = d[np.arange(Tloc), k]
                        return nearest.astype(int), dist.astype(int)

                    Env_anch: np.ndarray = Env.copy()
                    for zi in range(Z):
                        pm = np.where(peak_mask[zi, :])[0]
                        if pm.size == 0:
                            # fallback to all NMS peaks or skip if none
                            pm = np.where(nms_theta[zi, :])[0]
                        if pm.size == 0:
                            continue
                        nearest_idx, dist = _nearest_indices_circular(T, pm)
                        # Anchor only when within radius
                        use = dist <= anchor_rad
                        if np.any(use):
                            idxs = np.where(use)[0]
                            # use integer index array to satisfy type checker and ensure shape match
                            Env_anch[zi, idxs] = Env[zi, nearest_idx[idxs]]
                    Env = Env_anch
                except Exception:
                    # Ignore anchoring if any issue arises
                    pass
            # Optional: theta-local snap of envelope to nearest ridge within ±K columns
            if (not pin_to_origin) and theta_snap > 0:
                Ks = list(range(-theta_snap, theta_snap + 1))
                # tiny penalty to prefer smaller shifts
                alpha = 1e-6
                # Build candidate gains and pick best shift per cell
                best_env = Env
                best_gain = Env - R
                for kshift in Ks:
                    if kshift == 0:
                        continue
                    cand = np.roll(Env, kshift, axis=1)
                    gain = cand - R - alpha * abs(kshift)
                    use = gain > best_gain
                    # Only consider positive lifts
                    use &= gain > 0
                    best_env = np.where(use, cand, best_env)
                    best_gain = np.where(use, gain, best_gain)
                Env = best_env

            # If pinning to origin, build Env_apply which maps each propagated cell back to its source column
            if pin_to_origin:
                # Ensure origin_map exists; if not, create a default all -1
                if "origin_map" not in locals():
                    origin_map = -np.ones_like(R, dtype=int)
                Env_apply = Env.copy()
                # For cells with a valid origin, use the origin column's envelope value
                origin_idx = np.asarray(origin_map >= 0)
                if np.any(origin_idx):
                    # gather origin values per-cell
                    zs_idx, ts_idx = np.nonzero(origin_idx)
                    for zi, tj in zip(zs_idx.tolist(), ts_idx.tolist()):
                        o = int(origin_map[zi, tj])
                        if 0 <= o < T:
                            Env_apply[zi, tj] = Env[zi, o]
                # Use Env_apply going forward for lifting
                Env_to_use = Env_apply
            else:
                Env_to_use = Env

            # Lift valleys toward selected envelope; optionally valley-only to avoid widening
            valley_only = bool(style_opts.get("sf_edge_flow_valley_only", True))
            if valley_only:
                R_up = np.vstack([R[1:, :], R[-1:, :]])
                R_dn = np.vstack([R[:1, :], R[:-1, :]])
                med3 = np.median(np.stack([R_dn, R, R_up], axis=0), axis=0)
                # theta-local strict valley (local minima across theta)
                Rl = np.roll(R, 1, axis=1)
                Rr = np.roll(R, -1, axis=1)
                is_valley_theta = R < np.minimum(Rl, Rr)
                is_valley_z = R < med3
                # exclude theta peaks
                nms_theta = (R >= Rl) & (R >= Rr)
                mask_v = (is_valley_theta | is_valley_z) & (~nms_theta)
                # if ridge_paths with valley band, optionally constrain to where envelope exists
                if mode == "ridge_paths":
                    mask_v &= Env_to_use > -1e20
                R_new = np.where(
                    mask_v & (R < Env_to_use), R + amt * (Env_to_use - R), R
                )
            else:
                R_new = np.where(R < Env_to_use, R + amt * (Env_to_use - R), R)
            # Map back to raw-theta frame if twist compensation was active
            # inverse roll to raw theta indices (no-op if s_tw==0)
            R_new_raw = _roll_rows_theta(R_new, -s_tw)

            # Enforce outward-only invariant in raw-theta frame: ensure final raw radii
            # are at least the envelope mapped to the raw-theta frame. This guards
            # against frame-mismatch where Env_to_use is in the analysis frame while
            # R_new_raw is compared/applied in the raw-theta frame later on.
            try:
                if "Env_to_use" in locals():
                    Env_to_use_raw = _roll_rows_theta(Env_to_use, -s_tw)
                    # apply elementwise maximum to ensure r_final_raw >= Env_to_use_raw
                    R_new_raw = np.maximum(R_new_raw, Env_to_use_raw)
            except Exception:
                # best-effort: if anything goes wrong, leave R_new_raw unchanged
                pass
            # Verbose diagnostics: if enabled, record per-ring snapshots for rings
            # whose min radius after lifting is at or below drain + 1.0. This is
            # guarded by style flag 'sf_edge_flow_verbose_diagnostics' to avoid
            # impacting normal runs.
            try:
                verbose_diag = bool(
                    style_opts.get("sf_edge_flow_verbose_diagnostics", False)
                )
                verbose_write_file = bool(
                    style_opts.get("sf_edge_flow_verbose_write_file", True)
                )
                if verbose_diag:
                    try:
                        import json
                        import time
                        from pathlib import Path

                        repo_root = Path(
                            r"C:\Users\patij212\Downloads\PotFoundry-Lite-v2.0"
                        )
                        # prefer str for outpath to keep typing consistent when opening files
                        outpath = str(
                            repo_root / "tools" / "edgeflow_verbose_diagnostics.jsonl"
                        )
                        drain_thresh = float(
                            style_opts.get(
                                "sf_edge_flow_drain_protect_thresh", r_drain + 1.0
                            )
                        )
                        # compute per-ring minima of the final (raw) radii
                        min_per_row = np.min(R_new_raw, axis=1)
                        rows_to_dump = np.where(min_per_row <= drain_thresh)[0]
                        # write one JSON line per dump run with selected rings
                        # Reuse top-level `dump` variable to avoid shadowing/redefinition
                        dump.clear()
                        dump.update(
                            {
                                "timestamp": time.time(),
                                "stage": "post_deoffset",
                                "rows": [],
                            }
                        )
                        # Allow forcing a single probe zi via style options for targeted dumps
                        from typing import Optional

                        probe_zi_post: Optional[int] = None
                        try:
                            if isinstance(style_opts, dict):
                                v = style_opts.get("sf_edge_flow_probe_zi", None)
                                probe_zi_post = int(v) if v is not None else None
                        except Exception:
                            probe_zi_post = None
                        # Ensure probe_zi is included in rows_to_dump
                        try:
                            rows_set = set(rows_to_dump.tolist())
                            if probe_zi_post is not None:
                                pzi = int(probe_zi_post)
                                if 0 <= pzi < R_new_raw.shape[0]:
                                    rows_set.add(pzi)
                            rows_to_dump = np.array(sorted(list(rows_set)), dtype=int)
                        except Exception:
                            pass
                        for zi in rows_to_dump.tolist():
                            # Determine the envelope array that was applied in the raw-theta frame
                            Env_applied_raw_row = None
                            try:
                                if "Env_to_use_raw" in locals():
                                    # Env_to_use_raw already rolled by -s_tw earlier
                                    Env_applied_raw_row = np.asarray(
                                        Env_to_use_raw[zi, :], dtype=float
                                    )
                            except Exception:
                                Env_applied_raw_row = None

                            # Compute enforcement violations (where final_raw < applied envelope)
                            enforcement_count = None
                            enforcement_indices = None
                            try:
                                if (Env_applied_raw_row is not None) and (
                                    "R_new_raw" in locals()
                                ):
                                    mask = (
                                        np.asarray(R_new_raw[zi, :])
                                        < Env_applied_raw_row
                                    )
                                    enforcement_count = int(np.count_nonzero(mask))
                                    # store as Python list of ints for JSON
                                    enforcement_indices = np.where(mask)[0].tolist()
                            except Exception:
                                enforcement_count = None
                                enforcement_indices = None

                            row_entry = {
                                "zi": int(zi),
                                "z": float(z_outer[zi])
                                if "z_outer" in locals()
                                else float(zi),
                                "min_final_raw": float(min_per_row[zi]),
                                "R_raw_sample": np.asarray(R_raw[zi, :]).tolist()
                                if "R_raw" in locals()
                                else None,
                                "R_analysis_sample": np.asarray(R[zi, :]).tolist()
                                if "R" in locals()
                                else None,
                                "Env_sample": np.asarray(Env[zi, :]).tolist()
                                if "Env" in locals()
                                else None,
                                "Env_to_use_sample": np.asarray(
                                    Env_to_use[zi, :]
                                ).tolist()
                                if "Env_to_use" in locals()
                                else None,
                                "Env_applied_raw_sample": Env_applied_raw_row.tolist()
                                if (Env_applied_raw_row is not None)
                                else None,
                                # Env_to_use_raw_post is the envelope aligned to raw-theta after any deoffset
                                "Env_to_use_raw_post": (
                                    np.roll(
                                        Env_to_use_raw[zi, :], -int(s0), axis=0
                                    ).tolist()
                                    if (
                                        "Env_to_use_raw" in locals()
                                        and "s0" in locals()
                                    )
                                    else (
                                        np.asarray(Env_to_use[zi, :]).tolist()
                                        if "Env_to_use" in locals()
                                        else None
                                    )
                                ),
                                "origin_map_sample": np.asarray(
                                    origin_map[zi, :]
                                ).tolist()
                                if "origin_map" in locals()
                                else None,
                                "R_new_sample": np.asarray(R_new[zi, :]).tolist()
                                if "R_new" in locals()
                                else None,
                                "R_new_raw_sample": np.asarray(
                                    R_new_raw[zi, :]
                                ).tolist()
                                if "R_new_raw" in locals()
                                else None,
                                "enforcement_violations_count": enforcement_count,
                                "enforcement_violations_indices": enforcement_indices,
                            }
                            # Canonicalize keys for diagnostics consumers/tests
                            # Compute additional diagnostics: lift_delta and valley mask when possible
                            try:
                                T_loc = (
                                    int(R_new_raw.shape[1])
                                    if (
                                        "R_new_raw" in locals()
                                        and hasattr(R_new_raw, "shape")
                                    )
                                    else None
                                )
                            except Exception:
                                T_loc = None
                            theta_sample = None
                            if T_loc is not None and T_loc > 0:
                                try:
                                    theta_sample = (
                                        np.arange(T_loc) * (TAU / float(T_loc))
                                    ).tolist()
                                except Exception:
                                    theta_sample = None
                            # lift_delta = final_raw - original_raw if available
                            lift_delta = None
                            valley_mask = None
                            try:
                                if ("R_new_raw" in locals()) and ("R_raw" in locals()):
                                    arr_new = np.asarray(R_new_raw[zi, :], dtype=float)
                                    arr_raw = np.asarray(R_raw[zi, :], dtype=float)
                                    lift_delta = (arr_new - arr_raw).tolist()
                                    valley_mask = (arr_new > arr_raw + 1e-12).tolist()
                            except Exception:
                                lift_delta = None
                                valley_mask = None
                            # include shifts metadata where available
                            shifts_meta = None
                            s0_meta = None
                            try:
                                # ensure shifts is a list before converting
                                if "shifts" in locals() and shifts is not None:
                                    shifts_meta = np.asarray(shifts).tolist()
                            except Exception:
                                shifts_meta = None
                            try:
                                if "s0" in locals():
                                    s0_meta = int(s0)
                            except Exception:
                                s0_meta = None
                            # compute gradient/energy summaries if available
                            Gt_stats = None
                            Gz_stats = None
                            dom_counts = None
                            try:
                                if "Gt" in locals():
                                    gtr = np.asarray(Gt[zi, :], dtype=float)
                                    Gt_stats = {
                                        "min": float(gtr.min()),
                                        "max": float(gtr.max()),
                                        "mean": float(gtr.mean()),
                                    }
                            except Exception:
                                Gt_stats = None
                            try:
                                if "Gz" in locals():
                                    gzr = np.asarray(Gz[zi, :], dtype=float)
                                    Gz_stats = {
                                        "min": float(gzr.min()),
                                        "max": float(gzr.max()),
                                        "mean": float(gzr.mean()),
                                    }
                            except Exception:
                                Gz_stats = None
                            try:
                                if "dom" in locals():
                                    domr = np.asarray(dom[zi, :], dtype=int)
                                    cnts = np.bincount(domr, minlength=3)
                                    dom_counts = {
                                        "vert": int(cnts[0]),
                                        "diap": int(cnts[1]),
                                        "diam": int(cnts[2]),
                                    }
                            except Exception:
                                dom_counts = None

                            canonical_row = {
                                "zi": row_entry.get("zi"),
                                "z": row_entry.get("z"),
                                "min_final_raw": row_entry.get("min_final_raw"),
                                "R_raw_sample": row_entry.get("R_raw_sample"),
                                "R_analysis_sample": row_entry.get("R_analysis_sample"),
                                "Env_sample": row_entry.get("Env_sample"),
                                "Env_to_use_sample": row_entry.get("Env_to_use_sample"),
                                "Env_to_use_raw_post": row_entry.get(
                                    "Env_to_use_raw_post"
                                )
                                if row_entry.get("Env_to_use_raw_post") is not None
                                else row_entry.get("Env_applied_raw_sample"),
                                "origin_map_sample": row_entry.get("origin_map_sample"),
                                "R_new_sample": row_entry.get("R_new_sample"),
                                "R_new_raw_sample": row_entry.get("R_new_raw_sample"),
                                "enforcement_violations_count": row_entry.get(
                                    "enforcement_violations_count"
                                ),
                                "enforcement_violations_indices": row_entry.get(
                                    "enforcement_violations_indices"
                                ),
                                "theta_sample": theta_sample,
                                "lift_delta": lift_delta,
                                "valley_mask": valley_mask,
                                "shifts": shifts_meta,
                                "s0": s0_meta,
                            }
                            dump["rows"].append(row_entry)
                            # keep an in-memory copy for callers/tests when requested
                            try:
                                edgeflow_verbose_collector.append(
                                    {
                                        "timestamp": dump.get("timestamp"),
                                        "rows": [canonical_row],
                                    }
                                )
                            except Exception:
                                pass
                        # append the JSON line (skip file write if disabled)
                        if verbose_write_file:
                            with open(outpath, "a", encoding="utf-8") as fh:
                                fh.write(json.dumps(dump, ensure_ascii=False))
                                fh.write("\n")
                            try:
                                print(
                                    f"[sf_edge_flow_debug] verbose diagnostic wrote {len(rows_to_dump)} rows to {outpath}"
                                )
                            except Exception:
                                pass
                    except Exception:
                        pass
            except Exception:
                pass
            # Optional: correct small constant theta offset introduced by envelope selection
            # Preserve a pre-deoffset snapshot so diagnostics can compare pre/post shifts
            R_new_raw_pre = R_new_raw.copy()
            if bool(style_opts.get("sf_edge_flow_auto_deoffset", True)):
                try:
                    kmax = int(
                        style_opts.get("sf_edge_flow_deoffset_max", max(1, theta_snap))
                    )
                    kmax = max(0, min(3, kmax))
                    if kmax > 0:
                        # Estimate per-ring shift aligning R_new_raw to original R_raw using lifted-area correlation
                        def _best_shift(
                            row_new: np.ndarray,
                            row_old: np.ndarray,
                            mask: np.ndarray,
                            K: int,
                        ) -> int:
                            # If mask too sparse, fall back to full row
                            if mask is None or int(np.count_nonzero(mask)) < 4:
                                mask = np.ones_like(row_new, dtype=bool)
                            best_k = 0
                            best_score = -1e30
                            rn = row_new[mask]
                            for k in range(-K, K + 1):
                                ro = np.roll(row_old, k)[mask]
                                # use dot product as correlation proxy; subtract tiny penalty for larger |k|
                                score = float(np.dot(rn, ro)) - 1e-6 * abs(k)
                                if score > best_score:
                                    best_score = score
                                    best_k = k
                            return best_k

                        for zi in range(Z):
                            row_new = R_new_raw[zi, :]
                            row_old = R_raw[zi, :]
                            lift_mask = row_new > (row_old + 1e-12)
                            shifts.append(
                                _best_shift(row_new, row_old, lift_mask, kmax)
                            )
                        if shifts:
                            shifts_arr = np.asarray(shifts, dtype=int)
                            # choose median integer shift
                            s0 = int(np.median(shifts_arr))
                            if s0 != 0:
                                # ensure a simple majority agrees to avoid harming diagonal features
                                vals, counts = np.unique(shifts_arr, return_counts=True)
                                idx = int(np.argmax(counts))
                                top_shift = int(vals[idx])
                                frac = float(counts[idx]) / max(1, len(shifts_arr))
                                if top_shift == s0 and frac >= 0.55:
                                    R_new_raw = np.roll(R_new_raw, -s0, axis=1)
                except Exception:
                    pass

                    # Post-deoffset verbose diagnostics: write a JSONL entry after any
                    # automatic deoffset roll so we can detect whether the deoffset
                    # operation introduced small radii at or near the drain. This is
                    # guarded by 'sf_edge_flow_verbose_diagnostics' and will append one
                    # line per run with arrays for rows that are suspicious.
                    try:
                        verbose_diag = bool(
                            style_opts.get("sf_edge_flow_verbose_diagnostics", False)
                        )
                        if verbose_diag:
                            try:
                                import json
                                import time
                                from pathlib import Path

                                repo_root = Path(
                                    r"C:\Users\patij212\Downloads\PotFoundry-Lite-v2.0"
                                )
                                outpath = str(
                                    repo_root
                                    / "tools"
                                    / "edgeflow_verbose_diagnostics.jsonl"
                                )
                                drain_thresh = float(
                                    style_opts.get(
                                        "sf_edge_flow_drain_protect_thresh",
                                        r_drain + 1.0,
                                    )
                                )
                                # compute per-ring minima pre/post deoffset
                                min_pre = np.min(R_new_raw_pre, axis=1)
                                min_post = np.min(R_new_raw, axis=1)
                                rows_to_dump = np.where(min_post <= drain_thresh)[0]
                                dump = {
                                    "timestamp": time.time(),
                                    "stage": "post_deoffset",
                                    "rows": [],
                                }
                                # Attempt to capture deoffset decision details if available
                                dump["deoffset"] = {}
                                if "shifts" in locals():
                                    try:
                                        dump["deoffset"]["shifts"] = np.asarray(
                                            shifts
                                        ).tolist()
                                    except Exception:
                                        dump["deoffset"]["shifts"] = None
                                if "s0" in locals():
                                    dump["deoffset"]["s0"] = int(s0)
                                if "top_shift" in locals():
                                    dump["deoffset"]["top_shift"] = int(top_shift)
                                if "frac" in locals():
                                    dump["deoffset"]["top_frac"] = float(frac)

                                for zi in rows_to_dump.tolist():
                                    dump["rows"].append(
                                        {
                                            "zi": int(zi),
                                            "z": float(z_outer[zi])
                                            if "z_outer" in locals()
                                            else float(zi),
                                            "min_final_raw_post": float(min_post[zi]),
                                            "min_final_raw_pre": float(min_pre[zi]),
                                            "R_raw_sample": np.asarray(
                                                R_raw[zi, :]
                                            ).tolist()
                                            if "R_raw" in locals()
                                            else None,
                                            "R_analysis_sample": np.asarray(
                                                R[zi, :]
                                            ).tolist()
                                            if "R" in locals()
                                            else None,
                                            "Env_sample": np.asarray(
                                                Env[zi, :]
                                            ).tolist()
                                            if "Env" in locals()
                                            else None,
                                            "Env_to_use_sample": np.asarray(
                                                Env_to_use[zi, :]
                                            ).tolist()
                                            if "Env_to_use" in locals()
                                            else None,
                                            "origin_map_sample": np.asarray(
                                                origin_map[zi, :]
                                            ).tolist()
                                            if "origin_map" in locals()
                                            else None,
                                            "R_new_sample_pre": np.asarray(
                                                R_new[zi, :]
                                            ).tolist()
                                            if "R_new" in locals()
                                            else None,
                                            "R_new_raw_sample_pre": np.asarray(
                                                R_new_raw_pre[zi, :]
                                            ).tolist()
                                            if "R_new_raw_pre" in locals()
                                            else None,
                                            "R_new_raw_sample_post": np.asarray(
                                                R_new_raw[zi, :]
                                            ).tolist()
                                            if "R_new_raw" in locals()
                                            else None,
                                        }
                                    )
                                    # append the JSON line
                                    if verbose_write_file:
                                        with open(outpath, "a", encoding="utf-8") as fh:
                                            fh.write(
                                                json.dumps(dump, ensure_ascii=False)
                                            )
                                            fh.write("\n")
                                        try:
                                            print(
                                                f"[sf_edge_flow_debug] post-deoffset verbose diagnostic wrote {len(rows_to_dump)} rows to {outpath}"
                                            )
                                        except Exception:
                                            pass
                                    try:
                                        # Canonicalize post-deoffset rows for returned diagnostics
                                        canonical_rows: list[Dict[str, Any]] = []
                                        for r in dump.get("rows", []):
                                            canonical_rows.append(
                                                {
                                                    "zi": r.get("zi"),
                                                    "z": r.get("z"),
                                                    "min_final_raw_pre": r.get(
                                                        "min_final_raw_pre"
                                                    ),
                                                    "min_final_raw_post": r.get(
                                                        "min_final_raw_post"
                                                    ),
                                                    "R_raw_sample": r.get(
                                                        "R_raw_sample"
                                                    ),
                                                    "R_analysis_sample": r.get(
                                                        "R_analysis_sample"
                                                    ),
                                                    "Env_sample": r.get("Env_sample"),
                                                    "Env_to_use_sample": r.get(
                                                        "Env_to_use_sample"
                                                    ),
                                                    "origin_map_sample": r.get(
                                                        "origin_map_sample"
                                                    ),
                                                    "R_new_sample_pre": r.get(
                                                        "R_new_sample_pre"
                                                    ),
                                                    "R_new_raw_sample_pre": r.get(
                                                        "R_new_raw_sample_pre"
                                                    ),
                                                    "R_new_raw_sample_post": r.get(
                                                        "R_new_raw_sample_post"
                                                    ),
                                                    "theta_sample": None,
                                                    "lift_delta": None,
                                                    "valley_mask": None,
                                                    "shifts": dump.get(
                                                        "deoffset", {}
                                                    ).get("shifts")
                                                    if isinstance(
                                                        dump.get("deoffset", {}).get(
                                                            "shifts"
                                                        ),
                                                        list,
                                                    )
                                                    else None,
                                                    "s0": dump.get("deoffset", {}).get(
                                                        "s0"
                                                    )
                                                    if isinstance(
                                                        dump.get("deoffset", {}).get(
                                                            "s0"
                                                        ),
                                                        int,
                                                    )
                                                    else None,
                                                }
                                            )
                                        edgeflow_verbose_collector.append(
                                            {
                                                "timestamp": dump.get("timestamp"),
                                                "stage": dump.get("stage"),
                                                "deoffset": dump.get("deoffset"),
                                                "rows": canonical_rows,
                                            }
                                        )
                                    except Exception:
                                        pass
                            except Exception:
                                pass
                    except Exception:
                        pass

            # Final enforcement: auto-deoffset may have rolled R_new_raw and
            # could re-introduce values below the intended envelope. As a
            # safeguard, roll the previously-computed Env_to_use_raw by the
            # same deoffset applied (if any) and re-apply an outward-only
            # max to ensure r_final(θ,z) >= Env_to_use in the raw-theta frame.
            try:
                if "Env_to_use_raw" in locals() and "R_new_raw" in locals():
                    # Determine deoffset shift applied (s0 was used to roll by -s0)
                    deoff = 0
                    try:
                        deoff = int(s0) if "s0" in locals() else 0
                    except Exception:
                        deoff = 0
                    if deoff != 0:
                        # R_new_raw was rolled by -s0 earlier, so roll the envelope
                        # by the same -s0 to align frames
                        Env_to_use_raw_post = np.roll(Env_to_use_raw, -deoff, axis=1)
                    else:
                        Env_to_use_raw_post = Env_to_use_raw
                    # Compute before/after to detect how many entries change
                    try:
                        before = np.asarray(R_new_raw, dtype=float)
                        after = np.maximum(before, Env_to_use_raw_post)
                        diffs = after - before
                        # per-row count of theta columns changed
                        per_row_changes = np.count_nonzero(
                            diffs > 1e-12, axis=1
                        ).tolist()
                        total_changes = int(np.count_nonzero(diffs > 1e-12))
                        R_new_raw = after
                    except Exception:
                        # Best-effort enforcement if numeric path fails
                        R_new_raw = np.maximum(R_new_raw, Env_to_use_raw_post)
                        per_row_changes = None
                        total_changes = None
                    if bool(style_opts.get("sf_edge_flow_debug", False)):
                        print(
                            f"[sf_edge_flow_debug] final envelope enforcement applied (deoff={deoff}) - total_changes={total_changes}"
                        )
                    # Append a small JSONL summary so diagnostics can see exactly
                    # how many theta columns were raised by this final enforcement.
                    try:
                        import json
                        import time
                        from pathlib import Path

                        repo_root = Path(
                            r"C:\Users\patij212\Downloads\PotFoundry-Lite-v2.0"
                        )
                        outpath = str(
                            repo_root / "tools" / "edgeflow_verbose_diagnostics.jsonl"
                        )
                        fdump = {
                            "timestamp": time.time(),
                            "stage": "final_enforcement",
                            "deoff": int(deoff),
                            "total_changes": total_changes,
                            "per_row_changes": per_row_changes,
                        }
                        if verbose_write_file:
                            with open(outpath, "a", encoding="utf-8") as fh:
                                fh.write(json.dumps(fdump, ensure_ascii=False))
                                fh.write("\n")
                    except Exception:
                        pass

                        try:
                            # include final enforcement summary in the in-memory collector
                            canonical_fdump = {
                                "timestamp": fdump.get("timestamp"),
                                "stage": fdump.get("stage"),
                                "deoff": fdump.get("deoff"),
                                "total_changes": fdump.get("total_changes"),
                                "per_row_changes": fdump.get("per_row_changes"),
                            }
                            edgeflow_verbose_collector.append(canonical_fdump)
                        except Exception:
                            pass
                    except Exception:
                        pass

                    # Optional debug-mode assertion (opt-in via style_opts['sf_edge_flow_debug']).
                    # When enabled, raise a clear AssertionError if any final raw radius is
                    # strictly less than the post-deoffset envelope used for enforcement.
                    try:
                        debug_flag = bool(style_opts.get("sf_edge_flow_debug", False))
                    except Exception:
                        debug_flag = False
                    if debug_flag:
                        try:
                            env_post = Env_to_use_raw_post
                        except NameError:
                            env_post = Env_to_use_raw
                        if env_post is not None:
                            # Elementwise comparison; report compact failure message if any violations.
                            viol_mask = R_new_raw < env_post
                            n_viol = int(np.count_nonzero(viol_mask))
                            if n_viol > 0:
                                deltas = R_new_raw - env_post
                                min_delta = float(deltas.min())
                                # collect up to 8 sample (row, col) coords
                                viol_idx = np.transpose(np.nonzero(viol_mask))
                                sample_coords = [
                                    (int(r), int(c)) for r, c in viol_idx[:8]
                                ]
                                raise AssertionError(
                                    f"Edge-flow enforcement invariant violated: {n_viol} cells where final_raw < env_post; "
                                    f"min_delta={min_delta:.6f}; sample_coords={sample_coords}"
                                )
            except Exception:
                pass

            # Update vertex positions and cached samples
            for i in range(len(z_outer)):
                r_row = R_new_raw[i, :]
                cx_row = np.asarray(cx_rows_list[i], dtype=float)
                sy_row = np.asarray(sy_rows_list[i], dtype=float)
                idx_row = outer_idx[i]
                zz = float(z_outer[i])
                xs = (r_row * cx_row).tolist()
                ys = (r_row * sy_row).tolist()
                for j, vid in enumerate(idx_row.tolist()):
                    verts[vid] = (xs[j], ys[j], zz)
                # keep caches consistent
                r_outer_samples_list[i] = np.asarray(r_row, dtype=float)
    except Exception:
        # Fail-safe: do nothing on any error
        pass

    # Vectorized faces for outer wall with adaptive diagonals
    rows = len(z_outer) - 1
    # j_idx is an index array used for vectorized selection; annotate as NDArray[int]
    j_idx: npt.NDArray[np.int_] = np.arange(n_theta, dtype=int)
    jn = (j_idx + 1) % n_theta
    v00 = outer_idx[:-1, :][:, j_idx]
    v01 = outer_idx[:-1, :][:, jn]
    v10 = outer_idx[1:, :][:, j_idx]
    v11 = outer_idx[1:, :][:, jn]
    # Decide per-cell diagonal to reduce sliver/aliasing near sharp cuts
    try:
        r_outer_samples = np.vstack(
            r_outer_samples_list
        )  # shape (len(z_outer), n_theta)
        cx_rows = np.vstack(cx_rows_list)
        sy_rows = np.vstack(sy_rows_list)
        r00 = r_outer_samples[:-1, :][:, j_idx]
        r01 = r_outer_samples[:-1, :][:, jn]
        r10 = r_outer_samples[1:, :][:, j_idx]
        r11 = r_outer_samples[1:, :][:, jn]

        # Decide per-cell diagonal using geometry-based triangle quality for LowPolyFacet
        def _tri_quality(
            ax: NDArrayFloat | float,
            ay: NDArrayFloat | float,
            az: NDArrayFloat | float,
            bx: NDArrayFloat | float,
            by: NDArrayFloat | float,
            bz: NDArrayFloat | float,
            cx: NDArrayFloat | float,
            cy: NDArrayFloat | float,
            cz: NDArrayFloat | float,
        ) -> NDArrayFloat:
            ux = bx - ax
            uy = by - ay
            uz = bz - az
            vx = cx - ax
            vy = cy - ay
            vz = cz - az
            # edge c-b as well
            wx = cx - bx
            wy = cy - by
            wz = cz - bz
            # squared lengths
            u2 = ux * ux + uy * uy + uz * uz
            v2 = vx * vx + vy * vy + vz * vz
            w2 = wx * wx + wy * wy + wz * wz
            # area = 0.5 * ||u x v||
            cxv_x = uy * vz - uz * vy
            cxv_y = uz * vx - ux * vz
            cxv_z = ux * vy - uy * vx
            area2 = cxv_x * cxv_x + cxv_y * cxv_y + cxv_z * cxv_z  # (2A)^2
            # mean ratio: q = (4*sqrt(3)*A)/(a^2+b^2+c^2); here 4*sqrt(3)*A = sqrt(3) * sqrt(area2)
            num = np.sqrt(3.0) * np.sqrt(np.maximum(area2, 0.0))
            den = np.maximum(u2 + v2 + w2, 1e-12)
            return cast(NDArrayFloat, num / den)

        # Build 3D positions for corners of each quad cell (rows x cols)
        # Current and next ring z values
        z00 = np.broadcast_to(z_outer[:-1, None], r00.shape)
        z11 = np.broadcast_to(z_outer[1:, None], r11.shape)
        # XY for each corner using pre-rotated bases per ring
        x00 = r00 * cx_rows[:-1, :][:, j_idx]
        y00 = r00 * sy_rows[:-1, :][:, j_idx]
        x01 = r01 * cx_rows[:-1, :][:, jn]
        y01 = r01 * sy_rows[:-1, :][:, jn]
        x10 = r10 * cx_rows[1:, :][:, j_idx]
        y10 = r10 * sy_rows[1:, :][:, j_idx]
        x11 = r11 * cx_rows[1:, :][:, jn]
        y11 = r11 * sy_rows[1:, :][:, jn]

        # Quality for option A (diag 00-11): triangles (00,11,10) and (00,01,11)
        qA1 = _tri_quality(x00, y00, z00, x11, y11, z11, x10, y10, z11)
        qA2 = _tri_quality(x00, y00, z00, x01, y01, z00, x11, y11, z11)
        qA = np.minimum(qA1, qA2)
        # Quality for option B (diag 01-10): triangles (00,01,10) and (01,11,10)
        qB1 = _tri_quality(x00, y00, z00, x01, y01, z00, x10, y10, z11)
        qB2 = _tri_quality(x01, y01, z00, x11, y11, z11, x10, y10, z11)
        qB = np.minimum(qB1, qB2)

        # If current style is one of our geom-enabled styles, use geometry-based decision; else fallback
        _fn_name = getattr(r_outer_fn, "__name__", "")
        # Respect explicit style hint when provided for determinism (backcompat fallback to function identity/name)
        sf_style_hint_local = None
        try:
            if isinstance(style_opts, dict):
                sf_style_hint_local = style_opts.get("sf_style", None)
        except Exception:
            sf_style_hint_local = None
        if isinstance(sf_style_hint_local, str) and sf_style_hint_local.strip():
            s = sf_style_hint_local.strip().lower()
            is_geom_style = s in ("lowpolyfacet", "superformulablossom")
        else:
            is_geom_style = (
                (r_outer_fn == STYLES["LowPolyFacet"][0])
                or (_fn_name == getattr(STYLES["LowPolyFacet"][0], "__name__", ""))
                or (r_outer_fn == STYLES["SuperformulaBlossom"][0])
                or (
                    _fn_name
                    == getattr(STYLES["SuperformulaBlossom"][0], "__name__", "")
                )
            )
        if is_geom_style:
            use_alt = qB > qA
            # Reduce row-to-row sawtooth flips by applying a z-wise median-3 per column
            try:
                ua = use_alt.astype(np.int8)
                ua_up = np.vstack([ua[0:1, :], ua[:-1, :]])
                ua_dn = np.vstack([ua[1:, :], ua[-1:, :]])
                sum3 = ua_up + ua + ua_dn
                use_alt = sum3 >= 2
            except Exception:
                pass
        else:
            d_diag_00_11 = np.abs(r00 - r11)
            d_diag_01_10 = np.abs(r01 - r10)
            use_alt = d_diag_01_10 < d_diag_00_11
        # Optional 2D diagonal smoothing within seam bands: neighborhood majority to avoid θ zig-zag
        try:
            tiers_cfg = (
                int(style_opts.get("lp_tiers", 1))
                if isinstance(style_opts, dict)
                else 1
            )
            cut_b = (
                float(style_opts.get("lp_cut_bot_deg", 0.0))
                if isinstance(style_opts, dict)
                else 0.0
            )
            cut_t = (
                float(style_opts.get("lp_cut_top_deg", 0.0))
                if isinstance(style_opts, dict)
                else 0.0
            )
            # Accept both LP and Blossom diagonal smoothing toggles
            passes_diag = 0
            if isinstance(style_opts, dict):
                pd_lp = int(
                    max(0, min(4, int(style_opts.get("lp_diagonal_smooth_passes", 0))))
                )
                pd_sf = int(
                    max(0, min(4, int(style_opts.get("sf_diagonal_smooth_passes", 0))))
                )
                passes_diag = max(pd_lp, pd_sf)
            if (
                passes_diag > 0
                and (tiers_cfg > 1)
                and ((cut_b > 0.0) or (cut_t > 0.0))
                and H > 0
            ):
                h_tier = H / max(1, tiers_cfg)
                z_win_raw = float(style_opts.get("lp_cut_z_window_frac", 0.12))
                z_win_frac = (z_win_raw * 0.01) if z_win_raw > 1.0 else z_win_raw
                z_win = max(1e-6, z_win_frac * h_tier)
                seam_zs = [(k / tiers_cfg) * H for k in range(1, tiers_cfg)]
                z_mid = 0.5 * (z_outer[:-1] + z_outer[1:])
                ua = use_alt.astype(np.int8)
                for _ in range(passes_diag):
                    # θ-wise circular majority filter only within seam bands
                    ua_roll_l = np.roll(ua, 1, axis=1)
                    ua_roll_r = np.roll(ua, -1, axis=1)
                    sum3 = ua + ua_roll_l + ua_roll_r
                    ua_new = ua.copy()
                    for zs in seam_zs:
                        band_mask = np.abs(z_mid - zs) <= z_win
                        if np.any(band):
                            # majority threshold >=2 (of 3)
                            ua_new[band, :] = (sum3[band, :] >= 2).astype(np.int8)
                    ua = ua_new
                use_alt = ua >= 1
        except Exception:
            pass
        # Row-wise locking near seam bands to avoid alternating diagonals (zig-zag aliasing)
        try:
            tiers_cfg = (
                int(style_opts.get("lp_tiers", 1))
                if isinstance(style_opts, dict)
                else 1
            )
            cut_b = (
                float(style_opts.get("lp_cut_bot_deg", 0.0))
                if isinstance(style_opts, dict)
                else 0.0
            )
            cut_t = (
                float(style_opts.get("lp_cut_top_deg", 0.0))
                if isinstance(style_opts, dict)
                else 0.0
            )
            has_cuts = (tiers_cfg > 1) and ((cut_b > 0.0) or (cut_t > 0.0))
            if has_cuts and H > 0:
                h_tier = H / max(1, tiers_cfg)
                z_win_raw = (
                    float(style_opts.get("lp_cut_z_window_frac", 0.12))
                    if isinstance(style_opts, dict)
                    else 0.12
                )
                z_win_frac = (z_win_raw * 0.01) if z_win_raw > 1.0 else z_win_raw
                z_win = max(1e-6, z_win_frac * h_tier)
                lock_strength = (
                    float(style_opts.get("lp_seam_lock_strength", 1.0))
                    if isinstance(style_opts, dict)
                    else 1.0
                )
                lock_halfwidth = float(max(1.0, min(1.5, lock_strength))) * z_win
                seam_zs = [(k / tiers_cfg) * H for k in range(1, tiers_cfg)]
                z_mid = 0.5 * (z_outer[:-1] + z_outer[1:])
                # Band-wise locking: for each seam, choose a single diagonal orientation
                # across the entire seam window (±z_win) to avoid row-to-row flips.
                for zs in seam_zs:
                    band_mask = np.abs(z_mid - zs) <= lock_halfwidth
                    if not np.any(band_mask):
                        continue
                    # Aggregate preference across the band using the same metric used for selection
                    if is_geom_style:
                        # Sum of min-quality for each option across band: higher is better
                        sum_qA = float(np.sum(qA[band_mask]))
                        sum_qB = float(np.sum(qB[band_mask]))
                        pref_alt = sum_qB > sum_qA
                    else:
                        d_diag_00_11 = np.abs(r00 - r11)
                        d_diag_01_10 = np.abs(r01 - r10)
                        pref_alt = float(np.sum(d_diag_01_10[band_mask])) < float(
                            np.sum(d_diag_00_11[band_mask])
                        )
                    use_alt[band_mask, :] = pref_alt
        except Exception:
            pass
        # Default (diag 00-11)
        tri1_def = np.stack([v00, v11, v10], axis=2)
        tri2_def = np.stack([v00, v01, v11], axis=2)
        # Alternate (diag 01-10) with outward-facing winding
        tri1_alt = np.stack([v00, v01, v10], axis=2)
        tri2_alt = np.stack([v01, v11, v10], axis=2)
        tri1 = np.where(use_alt[..., None], tri1_alt, tri1_def).reshape(-1, 3)
        tri2 = np.where(use_alt[..., None], tri2_alt, tri2_def).reshape(-1, 3)
    except Exception:
        # Fallback to default diagonal if any issue arises
        tri1 = np.stack([v00, v11, v10], axis=2).reshape(-1, 3)
        tri2 = np.stack([v00, v01, v11], axis=2).reshape(-1, 3)
    faces_out_parts.append(tri1)
    faces_out_parts.append(tri2)

    # ---- Inner wall rings (clamp near drain)
    inner_idx = np.empty((len(z_inner), n_theta), dtype=int)
    clamp_count = 0
    total_inner_samples = len(z_inner) * n_theta
    for i, z in enumerate(z_inner):
        twist = _spin_twist_radians(z, H, style_opts)
        cTw, sTw = float(np.cos(twist)), float(np.sin(twist))
        r0 = base_radius(z, H, Rb, Rt, expn, style_opts)
        _opts = dict(style_opts)
        _opts.setdefault("_pf_rb", Rb)
        _opts.setdefault("_pf_rt", Rt)
        _opts.setdefault("_pf_expn", expn)
        # Parity with outer/preview: sample style at raw theta; apply twist only in placement
        # Normalize via the typed wrapper to avoid float/NDArray typing ambiguity
        r_out_vals = np.asarray(_call_r_outer(thetas, z, r0, H, _opts), dtype=float)
        r_in_vals = r_out_vals - t_wall
        min_allowed = r_drain + 1.0
        clamped = r_in_vals < min_allowed
        clamp_count += int(np.count_nonzero(clamped))
        r_in_vals[clamped] = min_allowed
        inner_idx[i] = add_ring_xy(r_in_vals, z, cTw, sTw)

    # Vectorized faces for inner wall (choose winding to also point outward-from-center)
    # rows_in = len(z_inner) - 1  # Computed but not used - kept for clarity
    vi00 = inner_idx[:-1, :][:, j_idx]
    vi01 = inner_idx[:-1, :][:, jn]
    vi10 = inner_idx[1:, :][:, j_idx]
    vi11 = inner_idx[1:, :][:, jn]
    tri_in1 = np.stack([vi00, vi11, vi10], axis=2).reshape(-1, 3)
    tri_in2 = np.stack([vi00, vi01, vi11], axis=2).reshape(-1, 3)
    faces_out_parts.append(tri_in1)
    faces_out_parts.append(tri_in2)

    # ---- Rim cap
    outer_top = outer_idx[-1]
    inner_top = inner_idx[-1]
    v00 = outer_top[j_idx]
    v01 = outer_top[jn]
    # Intermediate variables vi0, vi1 computed but not used - kept for clarity
    tri_rim1 = np.stack([outer_top[j_idx], inner_top[j_idx], inner_top[jn]], axis=1)
    tri_rim2 = np.stack([outer_top[j_idx], inner_top[jn], outer_top[jn]], axis=1)
    faces_out_parts.append(tri_rim1)
    faces_out_parts.append(tri_rim2)

    # ---- Drain circles (untwisted)
    drain_under: list[int] = []
    drain_top: list[int] = []
    # Vectorized drain circles using cached cos/sin
    for c, s in zip(cos_th, sin_th):
        x0 = r_drain * float(c)
        y0 = r_drain * float(s)
        drain_under.append(len(verts))
        verts.append((x0, y0, 0.0))
        drain_top.append(len(verts))
        verts.append((x0, y0, float(t_bottom)))
    drain_under_arr = np.array(drain_under, dtype=int)
    drain_top_arr = np.array(drain_top, dtype=int)
    outer_bottom = outer_idx[0]
    inner_bottom = inner_idx[0]

    # Bottom underside (outer bottom ring -> drain under ring)
    v00 = outer_bottom[j_idx]
    v01 = outer_bottom[jn]
    # Intermediate variables vd0, vd1 computed but not used - kept for clarity
    tri_bot1 = np.stack(
        [outer_bottom[j_idx], drain_under_arr[jn], drain_under_arr[j_idx]], axis=1
    )
    tri_bot2 = np.stack(
        [outer_bottom[j_idx], outer_bottom[jn], drain_under_arr[jn]], axis=1
    )
    faces_out_parts.append(tri_bot1)
    faces_out_parts.append(tri_bot2)

    # Top of bottom slab (inner bottom ring -> drain top ring)
    # Intermediate variables vi0, vi1, vd0, vd1 computed but not used - kept for clarity
    tri_top1 = np.stack(
        [inner_bottom[j_idx], inner_bottom[jn], drain_top_arr[jn]], axis=1
    )
    tri_top2 = np.stack(
        [inner_bottom[j_idx], drain_top_arr[jn], drain_top_arr[j_idx]], axis=1
    )
    faces_out_parts.append(tri_top1)
    faces_out_parts.append(tri_top2)

    # Drain cylinder wall
    # Intermediate variables v0b, v1b, v0t, v1t computed but not used - kept for clarity
    tri_cyl1 = np.stack(
        [drain_under_arr[j_idx], drain_top_arr[j_idx], drain_top_arr[jn]], axis=1
    )
    tri_cyl2 = np.stack(
        [drain_under_arr[j_idx], drain_top_arr[jn], drain_under_arr[jn]], axis=1
    )
    faces_out_parts.append(tri_cyl1)
    faces_out_parts.append(tri_cyl2)

    # Diagnostics (use tracked radii; fall back to scan if missing)
    if est_top_od is None:
        pts = np.array([verts[k] for k in outer_top], dtype=float)
        est_top_od = 2.0 * float(np.linalg.norm(pts[:, :2], axis=1).max())
    if est_bottom_od is None:
        pts = np.array([verts[k] for k in outer_bottom], dtype=float)
        est_bottom_od = 2.0 * float(np.linalg.norm(pts[:, :2], axis=1).max())
    clamp_ratio = clamp_count / max(1, total_inner_samples)

    diagnostics: Dict[str, Any] = dict(
        clamp_ratio_at_bottom=float(clamp_ratio),
        estimated_top_od_mm=float(est_top_od),
        estimated_bottom_od_mm=float(est_bottom_od),
    )
    if dbg_seam and dbg_total_picks > 0:
        diagnostics["seam_outward_ratio"] = float(dbg_outward_picks / dbg_total_picks)
    if dbg_seam and len(dbg_samples_collected) > 0:
        # Flatten and present a concise readout: list of sample groups
        diagnostics["seam_debug_samples"] = dbg_samples_collected
    # If the edge-flow in-memory collector exists and has content, attach it
    try:
        if (
            "edgeflow_verbose_collector" in locals()
            and isinstance(edgeflow_verbose_collector, list)
            and len(edgeflow_verbose_collector) > 0
        ):
            diagnostics["edgeflow_verbose"] = edgeflow_verbose_collector
    except Exception:
        pass
    faces_arr = np.vstack(faces_out_parts).astype(int, copy=False)
    return np.array(verts, dtype=float), faces_arr, diagnostics


plt: Any | None = None
try:
    import matplotlib.pyplot as _plt
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401

    plt = _plt
except Exception:
    # If matplotlib isn't available, set module-level sentinel to None
    plt = None


def save_preview_png(
    path: str | Path,
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    n_theta: int,
    n_z: int,
    r_outer_fn: Callable[..., Any],
    style_opts: Dict[str, Any],
) -> None:
    """Render a simple 3D surface preview and save to PNG.

    Parity with mesh builder: sample style at raw theta and apply twist only
    to XY placement so preview matches export.
    """
    if plt is None:
        return
    from pathlib import Path

    p = Path(path)
    th_samp = max(144, min(360, int(n_theta * 1.25)))
    z_samp = max(64, min(160, int(n_z * 1.25)))
    thetas = np.linspace(0.0, TAU, th_samp, endpoint=False)
    zs = np.linspace(0.0, H, z_samp)
    X = np.zeros((len(zs), len(thetas)))
    Y = np.zeros_like(X)
    Zm = np.zeros_like(X)
    base_cos = np.cos(thetas)
    base_sin = np.sin(thetas)
    for i, z in enumerate(zs):
        r0 = base_radius(
            z, H, Rb, Rt, expn, style_opts if isinstance(style_opts, dict) else {}
        )
        twist = _spin_twist_radians(
            z, H, style_opts if isinstance(style_opts, dict) else {}
        )
        cTw, sTw = float(np.cos(twist)), float(np.sin(twist))
        cx = base_cos * cTw - base_sin * sTw
        sy = base_sin * cTw + base_cos * sTw
        _opts = dict(style_opts) if isinstance(style_opts, dict) else {}
        _opts.setdefault("_pf_rb", Rb)
        _opts.setdefault("_pf_rt", Rt)
        _opts.setdefault("_pf_expn", expn)
        r_vals = np.asarray(r_outer_fn(thetas, z, r0, H, _opts), dtype=float)
        X[i, :] = r_vals * cx
        Y[i, :] = r_vals * sy
        Zm[i, :] = z
    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")
    ax.plot_surface(X, Y, Zm, rstride=1, cstride=1, linewidth=0.0, antialiased=True)
    ax.set_xlabel("X (mm)")
    ax.set_ylabel("Y (mm)")
    ax.set_zlabel("Z (mm)")
    ax.set_title(p.stem)
    p.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(p, dpi=180, bbox_inches="tight")
    plt.close(fig)

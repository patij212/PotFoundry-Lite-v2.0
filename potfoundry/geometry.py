# potfoundry/geometry.py — vNEXT2
# Geometry core with style-agnostic twist/spin and optimized mesh build.
from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

# Optional acceleration
try:
    import numba as _nb
    HAS_NUMBA = True
except Exception:
    HAS_NUMBA = False
    _nb = None  # type: ignore[assignment]

__all__ = [
    "STYLES",
    "MeshQuality",
    "PotDefaults",
    "build_pot_mesh",
    "r_base_out",
    "save_preview_png",
    "write_ascii_stl",  # deprecated - use write_stl_binary instead
]


# Shared base profile (outer radius vs height) with flare-center warp and bell
import math as _m


def base_radius(
    z: float, H: float, Rb: float, Rt: float, expn: float, opts: dict[str, Any],
) -> float:
    if H <= 0:
        return Rb
    # normalized height
    t = 0.0 if H == 0 else max(0.0, min(1.0, z / H))
    # Flare center warp (logistic remap of t)
    c = float(opts.get("flare_center", 0.5))
    k = float(opts.get("flare_sharp", 6.0))

    def _sig(x: float) -> float:
        return 1.0 / (1.0 + _m.exp(-k * (x - c)))

    s0 = _sig(0.0)
    s1 = _sig(1.0)
    tw = (_sig(t) - s0) / (s1 - s0 + 1e-9)
    r = Rb + (Rt - Rb) * (tw ** float(expn))
    # Optional mid-height bell
    amp = float(opts.get("bell_amp", 0.0))
    if amp != 0.0:
        mu = float(opts.get("bell_center", 0.5))
        width = max(0.05, float(opts.get("bell_width", 0.22)))
        sigma = max(1e-3, width * 0.5)
        g = _m.exp(-0.5 * ((t - mu) / sigma) ** 2)
        r *= 1.0 + amp * g
    return float(r)


def _call_r_outer(
    r_outer_fn: Callable[..., Any] | None,
    theta: float | npt.NDArray[np.float64],
    z: float,
    r0: float | npt.NDArray[np.float64],
    H: float,
    style_opts: dict[str, Any],
) -> float | npt.NDArray[np.float64]:
    """Adapter for r_outer_fn callables.

    Accepts either scalar theta or an ndarray of thetas. If `r_outer_fn` is None,
    returns the unmodulated base radius (r0) for the given inputs. If the
    provided callable supports vectorized inputs (ndarray), we pass them
    through; otherwise we fall back to element-wise evaluation and coerce the
    result to an ndarray of floats.
    """
    if r_outer_fn is None:
        return (
            np.asarray(r0, dtype=float) if isinstance(theta, np.ndarray) else float(r0)
        )

    # Vectorized theta path
    if isinstance(theta, np.ndarray):
        try:
            # Cache by (id(r_outer_fn), H, z, len(theta), hash(opts)) is expensive; rely on caller to batch per z
            res = r_outer_fn(theta, z, r0, H, style_opts)
            return np.asarray(res, dtype=float)
        except Exception:
            # Fallback: call per-element
            out = [
                float(
                    r_outer_fn(
                        float(t),
                        float(z),
                        float(r0) if not isinstance(r0, np.ndarray) else float(r0[i]),
                        float(H),
                        style_opts,
                    ),
                )
                for i, t in enumerate(theta)
            ]
            return np.array(out, dtype=float)

    # Scalar theta path
    try:
        res = r_outer_fn(
            float(theta),
            float(z),
            float(r0) if not isinstance(r0, np.ndarray) else float(r0),
            float(H),
            style_opts,
        )
        return float(res)
    except Exception:
        # Maybe the callable expects an ndarray; try calling with a 1-element array
        res = r_outer_fn(np.array([float(theta)], dtype=float), z, r0, H, style_opts)
        return float(np.asarray(res, dtype=float)[0])


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
) -> tuple[npt.NDArray[np.float64], npt.NDArray[np.float64], npt.NDArray[np.float64]]:
    """Cache theta grid computations for performance."""
    thetas = np.linspace(0.0, TAU, n_theta, endpoint=False)
    return thetas, np.cos(thetas), np.sin(thetas)


def r_base_out(z: float, H: float, Rb: float, Rt: float, expn: float) -> float:
    """Unmodulated outer radius vs height z (0..H), with flare exponent."""
    t = 0.0 if H <= 0 else z / H
    return float(Rb + (Rt - Rb) * (t**expn))


def _compute_normal(
    a: npt.NDArray[np.float64], b: npt.NDArray[np.float64], c: npt.NDArray[np.float64],
) -> npt.NDArray[np.float64]:
    """Compute face normal from three vertices."""
    n = np.cross(b - a, c - a)
    norm = np.linalg.norm(n)
    if norm == 0:
        return np.array([0.0, 0.0, 0.0], dtype=float)
    return n / norm


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
    # Ensure destination directory exists (important on Windows where /tmp may not exist)
    p = Path(path)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        # If parent cannot be created (e.g., path has no parent), proceed and let open() raise
        pass
    with open(p, "w") as f:
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


@lru_cache(maxsize=4096)
def _spin_twist_cached(z: float, H: float, turns: float, phase_deg: float, curve: float) -> float:
    if H <= 0:
        return 0.0
    if turns == 0.0 and phase_deg == 0.0:
        return 0.0
    t = max(0.0, min(1.0, z / H))
    return float((phase_deg * math.pi / 180.0) + (turns * TAU) * (t**max(0.1, curve)))


def _spin_twist_radians(z: float, H: float, opts: dict[str, Any]) -> float:
    """Smooth twist angle (in radians) applied to theta at height z.
    opts (style-agnostic):
      - spin_turns: total revolutions from base to rim (float, default 0.0)
      - spin_phase_deg: constant offset in degrees (float, default 0.0)
      - spin_curve_exp: easing exponent for twist vs height t=z/H (>=0.1, default 1.0)
    """
    turns = float(opts.get("spin_turns", 0.0))
    phase_deg = float(opts.get("spin_phase_deg", 0.0))
    curve = float(opts.get("spin_curve_exp", 1.0))
    return _spin_twist_cached(z, H, turns, phase_deg, curve)


# -----------------------------
# Styles (outer radius profiles)
# -----------------------------


def superformula_r(
    theta: float,
    m: float,
    n1: float,
    n2: float,
    n3: float,
    a: float = 1.0,
    b: float = 1.0,
) -> float:
    """Gielis superformula in polar. Returns a shape radius ~ O(1)."""
    c = abs(math.cos(m * theta / 4.0) / a) ** n2
    s = abs(math.sin(m * theta / 4.0) / b) ** n3
    denom = (c + s) ** (1.0 / max(n1, 1e-9))
    return 0.0 if denom == 0 else 1.0 / denom


# -----------------------------
# Optional Numba-accelerated cores
# -----------------------------

if HAS_NUMBA:
    @_nb.njit(cache=True, fastmath=True)
    def _nb_superformula_r(theta: np.ndarray, m: float, n1: float, n2: float, n3: float, a: float, b: float) -> np.ndarray:
        out = np.empty_like(theta)
        for i in range(theta.size):
            c = abs(np.cos(m * theta[i] / 4.0) / a) ** n2
            s = abs(np.sin(m * theta[i] / 4.0) / b) ** n3
            denom = (c + s) ** (1.0 / max(n1, 1e-9))
            out[i] = 0.0 if denom == 0.0 else 1.0 / denom
        return out

    @_nb.njit(cache=True, fastmath=True)
    def _nb_fourier_core(th: np.ndarray, t: float,
                         bc8: float, bc8p: float, bs4: float, bs4p: float,
                         bc12: float, bc12p: float,
                         tc11: float, tc11p: float, ts7: float, ts7p: float,
                         tc22: float, tc22p: float,
                         wob_amp: float, wob_freq: float, wob_zgain: float,
                         strength: float) -> np.ndarray:
        base = 1.0 + bc8 * np.cos(8.0 * th + bc8p) + bs4 * np.sin(4.0 * th + bs4p) + bc12 * np.cos(12.0 * th + bc12p)
        top = 1.0 + tc11 * np.cos(11.0 * th + tc11p) + ts7 * np.sin(7.0 * th + ts7p) + tc22 * np.cos(22.0 * th + tc22p)
        f = (1.0 - t) * base + t * top
        f *= 1.0 + wob_amp * np.sin(wob_freq * th + TAU * wob_zgain * t)
        return (1.0 + (f - 1.0) * strength)

    @_nb.njit(cache=True, fastmath=True)
    def _nb_spiral_core(th: np.ndarray, t: float, k: int, turns: float,
                        amp_min: float, amp_max: float, amp_curve: float,
                        groove_amp: float, groove_mult: float, phase_mult: float) -> np.ndarray:
        phase = TAU * turns * t
        amp = amp_min + (amp_max - amp_min) * (t ** amp_curve)
        f = 1.0 + amp * np.sin(k * th + phase)
        f += groove_amp * np.sin(groove_mult * k * th + phase_mult * phase)
        return f

    @_nb.njit(cache=True, fastmath=True)
    def _nb_superellipse_core(th: np.ndarray, m_exp: float, c4a: float, c4p: float, c8a: float, c8p: float) -> np.ndarray:
        c = np.abs(np.cos(th)) ** m_exp
        s = np.abs(np.sin(th)) ** m_exp
        rf = (c + s) ** (-1.0 / max(m_exp, 1e-9))
        rf *= 1.0 + c4a * np.cos(4.0 * th + c4p) + c8a * np.cos(8.0 * th + c8p)
        return rf

    @_nb.njit(cache=True, fastmath=True)
    def _nb_harmonic_core(th: np.ndarray, t: float, petals: int, pet_amp: float, pet_ph: float, pet_zg: float,
                          rip_freq: int, rip_amp: float, rip_ph: float, rip_zg: float,
                          bell: float) -> np.ndarray:
        f = 1.0 + pet_amp * np.cos(petals * th + pet_ph + TAU * pet_zg * t)
        f *= 1.0 + rip_amp * np.sin(rip_freq * th + rip_ph + TAU * rip_zg * t)
        f *= 1.0 + bell * np.exp(-((t - 0.5) ** 2) / 0.04)
        return f


def r_outer_superformula_blossom(
    theta: float | npt.NDArray[np.float64], z: float, r0: float, H: float, opts: dict[str, Any],
) -> float | npt.NDArray[np.float64]:
    t = z / H if H > 0 else 0.0
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
    th = np.asarray(theta, dtype=float)
    th = np.atleast_1d(th)
    if HAS_NUMBA and th.ndim == 1:
        rf = _nb_superformula_r(th, m, n1, n2, n3, a, b)
    else:
        # Vectorized NumPy implementation to avoid Python-level loops
        # (faster than list comprehension for typical theta sizes)
        thv = np.asarray(th, dtype=float)
        c = np.abs(np.cos(m * thv / 4.0) / a) ** n2
        s = np.abs(np.sin(m * thv / 4.0) / b) ** n3
        denom = (c + s) ** (1.0 / max(n1, 1e-9))
        # Avoid divide by zero
        rf = np.where(denom == 0.0, 0.0, 1.0 / denom)
    res = r0 * (0.90 + 0.35 * rf)
    # Handle both scalar and vectorized inputs robustly. If the input `theta`
    # was scalar, coerce the computed result to a Python float; otherwise
    # return the numpy array of values.
    if np.ndim(theta) == 0:
        return float(np.asarray(res).item())
    return res


def r_outer_fourier_bloom(
    theta: float | npt.NDArray[np.float64], z: float, r0: float, H: float, opts: dict[str, Any],
) -> float | npt.NDArray[np.float64]:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)
    th = np.atleast_1d(th)
    bc8 = float(opts.get("fb_base_cos8_amp", 0.12))
    bc8p = float(opts.get("fb_base_cos8_phase", 0.0))
    bs4 = float(opts.get("fb_base_sin4_amp", 0.05))
    bs4p = float(opts.get("fb_base_sin4_phase", 0.6))
    bc12 = float(opts.get("fb_base_cos12_amp", -0.04))
    bc12p = float(opts.get("fb_base_cos12_phase", 1.3))
    tc11 = float(opts.get("fb_top_cos11_amp", 0.18))
    tc11p = float(opts.get("fb_top_cos11_phase", 0.5))
    ts7 = float(opts.get("fb_top_sin7_amp", -0.07))
    ts7p = float(opts.get("fb_top_sin7_phase", 0.0))
    tc22 = float(opts.get("fb_top_cos22_amp", 0.05))
    tc22p = float(opts.get("fb_top_cos22_phase", 0.9))
    wob_amp = float(opts.get("fb_wobble_amp", 0.06))
    wob_freq = float(opts.get("fb_wobble_freq", 5))
    wob_zgain = float(opts.get("fb_wobble_zgain", 0.5))
    strength = float(opts.get("fb_strength", 1.0))
    if HAS_NUMBA and th.ndim == 1:
        f_strength = _nb_fourier_core(th, t, bc8, bc8p, bs4, bs4p, bc12, bc12p,
                                      tc11, tc11p, ts7, ts7p, tc22, tc22p,
                                      wob_amp, wob_freq, wob_zgain, strength)
        res = r0 * f_strength
    else:
        base = 1.0 + bc8 * np.cos(8 * th + bc8p) + bs4 * np.sin(4 * th + bs4p) + bc12 * np.cos(12 * th + bc12p)
        top = 1.0 + tc11 * np.cos(11 * th + tc11p) + ts7 * np.sin(7 * th + ts7p) + tc22 * np.cos(22 * th + tc22p)
        f = (1 - t) * base + t * top
        f *= 1.0 + wob_amp * np.sin(wob_freq * th + TAU * wob_zgain * t)
        res = r0 * (1.0 + (f - 1.0) * strength)
    return float(res) if np.ndim(theta) == 0 else res


def r_outer_spiral_ridges(
    theta: float | npt.NDArray[np.float64], z: float, r0: float, H: float, opts: dict[str, Any],
) -> float | npt.NDArray[np.float64]:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)
    th = np.atleast_1d(th)
    k = int(opts.get("spiral_k", 9))
    turns = float(opts.get("spiral_turns", 1.15))
    phase = TAU * turns * t
    amp_min = float(opts.get("spiral_amp_min", 0.15))
    amp_max = float(opts.get("spiral_amp_max", 0.25))
    amp_curve = float(opts.get("spiral_amp_curve", 1.3))
    amp = amp_min + (amp_max - amp_min) * (t**amp_curve)
    groove_amp = float(opts.get("spiral_groove_amp", 0.04))
    groove_mult = float(opts.get("spiral_groove_mult", 3.0))
    phase_mult = float(opts.get("spiral_phase_mult", 1.7))
    if HAS_NUMBA and th.ndim == 1:
        f = _nb_spiral_core(th, t, k, turns, amp_min, amp_max, amp_curve,
                            groove_amp, groove_mult, phase_mult)
    else:
        f = 1.0 + amp * np.sin(k * th + phase)
        f += groove_amp * np.sin(groove_mult * k * th + phase_mult * phase)
    res = r0 * f
    return float(res) if np.ndim(theta) == 0 else res


def r_outer_superellipse_morph(
    theta: float | npt.NDArray[np.float64], z: float, r0: float, H: float, opts: dict[str, Any],
) -> float | npt.NDArray[np.float64]:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)
    th = np.atleast_1d(th)
    m_base = float(opts.get("se_m_base", 2.0))
    m_top = float(opts.get("se_m_top", 5.5))
    m_curve = float(opts.get("se_m_curve_exp", 1.1))
    m_exp = m_base + (m_top - m_base) * (t**m_curve)
    c4a = float(opts.get("se_c4_amp", 0.08))
    c4p = float(opts.get("se_c4_phase_deg", 23)) * math.pi / 180.0
    c8a = float(opts.get("se_c8_amp", 0.03))
    c8p = float(opts.get("se_c8_phase_deg", 0)) * math.pi / 180.0
    if HAS_NUMBA and th.ndim == 1:
        rf = _nb_superellipse_core(th, m_exp, c4a, c4p, c8a, c8p)
    else:
        c = np.abs(np.cos(th)) ** m_exp
        s = np.abs(np.sin(th)) ** m_exp
        rf = (c + s) ** (-1.0 / max(m_exp, 1e-9))
        rf *= 1.0 + c4a * np.cos(4 * th + c4p) + c8a * np.cos(8 * th + c8p)
    res = r0 * rf
    return float(res) if np.ndim(theta) == 0 else res


def r_outer_harmonic_ripple(
    theta: float | npt.NDArray[np.float64], z: float, r0: float, H: float, opts: dict[str, Any],
) -> float | npt.NDArray[np.float64]:
    t = z / H if H > 0 else 0.0
    th = np.asarray(theta, dtype=float)
    th = np.atleast_1d(th)
    petals = int(opts.get("hr_petals", 7))
    pet_amp = float(opts.get("hr_petal_amp", 0.16))
    pet_ph = float(opts.get("hr_petal_phase_deg", 17)) * math.pi / 180.0
    pet_zg = float(opts.get("hr_petal_zgain", 0.6))

    rip_freq = int(opts.get("hr_ripple_freq", 31))
    rip_amp = float(opts.get("hr_ripple_amp", 0.03))
    rip_ph = float(opts.get("hr_ripple_phase_deg", 0)) * math.pi / 180.0
    rip_zg = float(opts.get("hr_ripple_zgain", 1.0))

    bell = float(opts.get("hr_bell", 0.05))

    if HAS_NUMBA and th.ndim == 1:
        f = _nb_harmonic_core(th, t, petals, pet_amp, pet_ph, pet_zg,
                              rip_freq, rip_amp, rip_ph, rip_zg, bell)
    else:
        f = 1.0 + pet_amp * np.cos(petals * th + pet_ph + TAU * pet_zg * t)
        f *= 1.0 + rip_amp * np.sin(rip_freq * th + rip_ph + TAU * rip_zg * t)
        f *= 1.0 + bell * np.exp(-((t - 0.5) ** 2) / 0.04)
    res = r0 * f
    return float(res) if np.ndim(theta) == 0 else res


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
}

@lru_cache(maxsize=2048)
def _cached_r_ext(
    z: float,
    H: float,
    Rb: float,
    Rt: float,
    expn: float,
    n_theta: int,
    twist: float,
    style_fn_name: str,
    style_opts_serialized: str,
) -> np.ndarray:
    """Cache outer radius modulation samples at a given z for current geometry.

    Key includes twist so spin changes invalidate cache. style_opts serialized JSON ensures
    style parameter changes cause recomputation.
    """
    r_outer_entry = STYLES.get(style_fn_name)
    r_outer_fn = r_outer_entry[0] if r_outer_entry else None
    thetas, _, _ = _theta_grid_cached(n_theta)
    # Base radius (style-independent here; bell/flare are controlled at call sites)
    r0 = base_radius(z, H, Rb, Rt, expn, {})
    # We still need style_opts for style function amplitude variations; pass deserialized lazily
    import json as _json
    style_opts = _json.loads(style_opts_serialized) if style_opts_serialized else {}
    if r_outer_fn is None:
        return np.full(n_theta, r0, dtype=float)
    r_ext = _call_r_outer(r_outer_fn, thetas + twist, z, r0, H, style_opts)
    return np.asarray(r_ext, dtype=float)


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
    expn: float,
    n_theta: int,
    n_z: int,
    r_outer_fn: Callable[..., Any] | None,
    style_opts: dict[str, Any],
) -> tuple[npt.NDArray[np.float64], npt.NDArray[np.int32], dict[str, Any]]:
    """Generate a watertight triangular pot mesh (vertices, faces, diagnostics).

    Performance Notes:
        This implementation vectorizes the theta dimension and now also:
        - Preallocates the full vertex and face arrays (removes per-vertex Python loop append overhead)
        - Vectorizes base radius computation across all z samples
        - Caches theta grid via _theta_grid_cached
        - Avoids temporary Python tuple constructions for faces (direct NumPy assembly)

    Parity:
        Sampling still occurs at (theta + twist) for each z, preserving previous geometric output for styles.
        Ordering of faces is kept consistent: outer wall, inner wall, rim cap, bottom underside,
        top slab, drain cylinder.

    Returns:
        verts: (N,3) float64 array
        faces: (M,3) int32 array (triangle vertex indices)
        diagnostics: dict with clamp/tolerance information

    """
    assert (
        H > 0 and Rt > 0 and Rb > 0 and t_wall > 0 and t_bottom >= 2.0
    ), "Invalid size parameters."
    assert r_drain > 0 and r_drain < (
        Rb - t_wall - 2.0
    ), "Drain hole too large for base—adjust sizes."

    # Use cached theta grid to avoid recomputing across calls
    thetas, cos_th, sin_th = _theta_grid_cached(int(n_theta))
    z_outer = np.linspace(0.0, H, n_z + 1)
    z_inner = np.linspace(t_bottom, H, n_z + 1)

    # -------- Vectorized helper functions --------
    def base_radius_array(zs: np.ndarray) -> np.ndarray:
        """Vectorized base_radius for array of z values.

        Mirrors logic in base_radius() but executes in bulk to reduce Python overhead.
        """
        if H <= 0:
            return np.full_like(zs, Rb, dtype=float)
        t = np.clip(zs / H, 0.0, 1.0)
        c_flare = float(style_opts.get("flare_center", 0.5))
        k_flare = float(style_opts.get("flare_sharp", 6.0))
        # Logistic remap
        sig = lambda x: 1.0 / (1.0 + np.exp(-k_flare * (x - c_flare)))  # noqa: E731
        s0 = sig(0.0)
        s1 = sig(1.0)
        tw = (sig(t) - s0) / (s1 - s0 + 1e-9)
        r = Rb + (Rt - Rb) * (tw ** float(expn))
        amp = float(style_opts.get("bell_amp", 0.0))
        if amp != 0.0:
            mu = float(style_opts.get("bell_center", 0.5))
            width = max(0.05, float(style_opts.get("bell_width", 0.22)))
            sigma = max(1e-3, width * 0.5)
            g = np.exp(-0.5 * ((t - mu) / sigma) ** 2)
            r = r * (1.0 + amp * g)
        return r.astype(float)

    # Precompute twist angles and base radii (vectorized + cached outer radius modulation)
    _base_r_outer = base_radius_array(z_outer)  # kept for diagnostics; caching below uses r_ext_cache
    _base_r_inner = base_radius_array(z_inner)
    twist_outer = np.array([_spin_twist_radians(z, H, style_opts) for z in z_outer], dtype=float)
    twist_inner = np.array([_spin_twist_radians(z, H, style_opts) for z in z_inner], dtype=float)

    # Style serialization for caching key
    import json as _json
    style_opts_serialized = _json.dumps(style_opts, sort_keys=True)
    style_fn_name = r_outer_fn.__name__ if r_outer_fn else "__none__"

    # Unified z set to avoid duplicate style sampling for overlapping rings
    z_all = np.unique(np.concatenate([z_outer, z_inner]))
    twist_map = {float(z): _spin_twist_radians(float(z), H, style_opts) for z in z_all}
    # Cache map from z to r_ext array
    r_ext_cache: dict[float, np.ndarray] = {}
    if r_outer_fn is None:
        # No style modulation: fill directly from base radii (outer or inner wall difference handled later)
        for z in z_all:
            # Choose base radius depending on whether z is in outer array first (they have same formula)
            r0 = base_radius(z, H, Rb, Rt, expn, style_opts)
            r_ext_cache[z] = np.full(n_theta, r0, dtype=float)
    else:
        for z in z_all:
            tw = twist_map[z]
            r_ext_cache[z] = _cached_r_ext(z, H, Rb, Rt, expn, n_theta, tw, style_fn_name, style_opts_serialized)

    # Preallocate vertex array size:
    # Outer rings: (n_z+1)*n_theta
    # Inner rings: (n_z+1)*n_theta
    # Drain: 2 * n_theta (under + top)
    total_vertices = (2 * (n_z + 1) + 2) * n_theta
    verts = np.empty((total_vertices, 3), dtype=float)

    # Index trackers
    outer_idx = np.empty((len(z_outer), n_theta), dtype=int)
    inner_idx = np.empty((len(z_inner), n_theta), dtype=int)
    drain_under_idx = np.empty(n_theta, dtype=int)
    drain_top_idx = np.empty(n_theta, dtype=int)

    # Placement helper (vectorized ring fill)
    def place_ring(start: int, r_vals: np.ndarray, z_val: float, twist_val: float) -> np.ndarray:
        cTw = math.cos(twist_val)
        sTw = math.sin(twist_val)
        cx = cos_th * cTw - sin_th * sTw
        sy = sin_th * cTw + cos_th * sTw
        xs = r_vals * cx
        ys = r_vals * sy
        end = start + n_theta
        verts[start:end, 0] = xs
        verts[start:end, 1] = ys
        verts[start:end, 2] = z_val
        return np.arange(start, end, dtype=int)

    cursor = 0
    # ---- Outer rings
    for i, (z, tw) in enumerate(zip(z_outer, twist_outer)):
        r_ext_arr = r_ext_cache[float(z)]
        outer_idx[i] = place_ring(cursor, r_ext_arr, z, tw)
        cursor += n_theta

    # ---- Inner rings (wall offset and clamp near drain)
    clamp_count = 0
    total_inner_samples = len(z_inner) * n_theta
    min_allowed = r_drain + 1.0
    for i, (z, tw) in enumerate(zip(z_inner, twist_inner)):
        r_out_arr = r_ext_cache[float(z)]
        r_in_arr = r_out_arr - t_wall
        clamped_mask = r_in_arr < min_allowed
        if np.any(clamped_mask):
            clamp_count += int(np.count_nonzero(clamped_mask))
            r_in_arr[clamped_mask] = min_allowed
        inner_idx[i] = place_ring(cursor, r_in_arr, z, tw)
        cursor += n_theta

    # ---- Drain circles (no twist)
    # Under circle (z=0)
    _cTw0 = 1.0
    _sTw0 = 0.0
    xs = r_drain * cos_th
    ys = r_drain * sin_th
    end_under = cursor + n_theta
    verts[cursor:end_under, 0] = xs
    verts[cursor:end_under, 1] = ys
    verts[cursor:end_under, 2] = 0.0
    drain_under_idx[:] = np.arange(cursor, end_under, dtype=int)
    cursor = end_under
    # Top circle (z=t_bottom)
    end_top = cursor + n_theta
    verts[cursor:end_top, 0] = xs
    verts[cursor:end_top, 1] = ys
    verts[cursor:end_top, 2] = float(t_bottom)
    drain_top_idx[:] = np.arange(cursor, end_top, dtype=int)
    cursor = end_top

    assert cursor == total_vertices, "Vertex preallocation mismatch—cursor did not reach expected total."  # safety

    # -------- Face assembly (vectorized) --------
    j = np.arange(n_theta, dtype=int)
    jn = (j + 1) % n_theta

    rows_outer = len(z_outer) - 1
    rows_inner = len(z_inner) - 1
    faces_per_section = 2 * n_theta
    total_faces = faces_per_section * (rows_outer + rows_inner + 4)  # 4 extra sections: rim + bottom underside + top slab + drain cyl
    faces = np.empty((total_faces, 3), dtype=np.int32)
    f_cursor = 0

    # Outer wall faces
    for i in range(rows_outer):
        v00 = outer_idx[i, j]
        v01 = outer_idx[i, jn]
        v10 = outer_idx[i + 1, j]
        v11 = outer_idx[i + 1, jn]
        # First triangles (v00, v10, v11)
        faces[f_cursor : f_cursor + n_theta, 0] = v00
        faces[f_cursor : f_cursor + n_theta, 1] = v10
        faces[f_cursor : f_cursor + n_theta, 2] = v11
        f_cursor += n_theta
        # Second triangles (v00, v11, v01)
        faces[f_cursor : f_cursor + n_theta, 0] = v00
        faces[f_cursor : f_cursor + n_theta, 1] = v11
        faces[f_cursor : f_cursor + n_theta, 2] = v01
        f_cursor += n_theta

    # Inner wall (reverse winding)
    for i in range(rows_inner):
        v00 = inner_idx[i, j]
        v01 = inner_idx[i, jn]
        v10 = inner_idx[i + 1, j]
        v11 = inner_idx[i + 1, jn]
        faces[f_cursor : f_cursor + n_theta, 0] = v00
        faces[f_cursor : f_cursor + n_theta, 1] = v11
        faces[f_cursor : f_cursor + n_theta, 2] = v10
        f_cursor += n_theta
        faces[f_cursor : f_cursor + n_theta, 0] = v00
        faces[f_cursor : f_cursor + n_theta, 1] = v01
        faces[f_cursor : f_cursor + n_theta, 2] = v11
        f_cursor += n_theta

    # Rim cap (outer top to inner top)
    outer_top = outer_idx[-1]
    inner_top = inner_idx[-1]
    v00 = outer_top[j]
    v01 = outer_top[jn]
    vi0 = inner_top[j]
    vi1 = inner_top[jn]
    faces[f_cursor : f_cursor + n_theta, 0] = v00
    faces[f_cursor : f_cursor + n_theta, 1] = vi0
    faces[f_cursor : f_cursor + n_theta, 2] = vi1
    f_cursor += n_theta
    faces[f_cursor : f_cursor + n_theta, 0] = v00
    faces[f_cursor : f_cursor + n_theta, 1] = vi1
    faces[f_cursor : f_cursor + n_theta, 2] = v01
    f_cursor += n_theta

    # Bottom underside (outer bottom ring -> drain under)
    outer_bottom = outer_idx[0]
    v00 = outer_bottom[j]
    v01 = outer_bottom[jn]
    vd0 = drain_under_idx[j]
    vd1 = drain_under_idx[jn]
    faces[f_cursor : f_cursor + n_theta, 0] = v00
    faces[f_cursor : f_cursor + n_theta, 1] = vd1
    faces[f_cursor : f_cursor + n_theta, 2] = vd0
    f_cursor += n_theta
    faces[f_cursor : f_cursor + n_theta, 0] = v00
    faces[f_cursor : f_cursor + n_theta, 1] = v01
    faces[f_cursor : f_cursor + n_theta, 2] = vd1
    f_cursor += n_theta

    # Top of bottom slab (inner bottom ring -> drain top)
    inner_bottom = inner_idx[0]
    vi0 = inner_bottom[j]
    vi1 = inner_bottom[jn]
    vd0 = drain_top_idx[j]
    vd1 = drain_top_idx[jn]
    faces[f_cursor : f_cursor + n_theta, 0] = vi0
    faces[f_cursor : f_cursor + n_theta, 1] = vi1
    faces[f_cursor : f_cursor + n_theta, 2] = vd1
    f_cursor += n_theta
    faces[f_cursor : f_cursor + n_theta, 0] = vi0
    faces[f_cursor : f_cursor + n_theta, 1] = vd1
    faces[f_cursor : f_cursor + n_theta, 2] = vd0
    f_cursor += n_theta

    # Drain cylinder wall
    v0b = drain_under_idx[j]
    v1b = drain_under_idx[jn]
    v0t = drain_top_idx[j]
    v1t = drain_top_idx[jn]
    faces[f_cursor : f_cursor + n_theta, 0] = v0b
    faces[f_cursor : f_cursor + n_theta, 1] = v0t
    faces[f_cursor : f_cursor + n_theta, 2] = v1t
    f_cursor += n_theta
    faces[f_cursor : f_cursor + n_theta, 0] = v0b
    faces[f_cursor : f_cursor + n_theta, 1] = v1t
    faces[f_cursor : f_cursor + n_theta, 2] = v1b
    f_cursor += n_theta

    assert f_cursor == total_faces, "Face preallocation mismatch—cursor did not reach expected total."  # safety
    # Diagnostics (computed from already-built arrays)
    outer_bottom = outer_idx[0]
    def ring_od(ids: np.ndarray) -> float:
        pts = verts[ids]
        rs = np.linalg.norm(pts[:, :2], axis=1)
        return 2.0 * float(np.max(rs))
    est_top_od = ring_od(outer_top)
    est_bottom_od = ring_od(outer_bottom)
    clamp_ratio = clamp_count / max(1, total_inner_samples)
    diagnostics = {
        "clamp_ratio_at_bottom": float(clamp_ratio),
        "estimated_top_od_mm": float(est_top_od),
        "estimated_bottom_od_mm": float(est_bottom_od),
        "vertex_count": int(total_vertices),
        "face_count": int(total_faces),
    }
    return verts, faces.astype(np.int32), diagnostics


plt: Any | None = None
try:
    import matplotlib.pyplot as _plt
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401

    plt = _plt
except Exception:
    # plt stays as None when matplotlib is unavailable
    pass


def save_preview_png(
    path,
    H: float,
    Rt: float,
    Rb: float,
    expn: float,
    n_theta: int,
    n_z: int,
    r_outer_fn,
    style_opts: dict,
) -> None:
    if plt is None:
        return
    th_samp = max(144, min(360, int(n_theta * 1.25)))
    z_samp = max(64, min(160, int(n_z * 1.25)))
    thetas = np.linspace(0.0, TAU, th_samp, endpoint=False)
    zs = np.linspace(0.0, H, z_samp)
    X = np.zeros((len(zs), len(thetas)))
    Y = np.zeros_like(X)
    Z = np.zeros_like(X)
    base_cos = np.cos(thetas)
    base_sin = np.sin(thetas)
    for i, z in enumerate(zs):
        r0 = base_radius(z, H, Rb, Rt, expn, style_opts)
        twist = _spin_twist_radians(z, H, style_opts)
        cTw, sTw = math.cos(twist), math.sin(twist)
        cx = base_cos * cTw - base_sin * sTw
        sy = base_sin * cTw + base_cos * sTw
        # Use adapter which handles scalar and vector callables
        rexts = _call_r_outer(r_outer_fn, thetas + twist, z, r0, H, style_opts)
        rexts = np.asarray(rexts, dtype=float)
        X[i, :] = rexts * cx
        Y[i, :] = rexts * sy
        Z[i, :] = z
    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")
    ax.plot_surface(X, Y, Z, rstride=1, cstride=1, linewidth=0.0, antialiased=True)
    ax.set_xlabel("X (mm)")
    ax.set_ylabel("Y (mm)")
    ax.set_zlabel("Z (mm)")
    ax.set_title(path.stem)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=180, bbox_inches="tight")
    plt.close(fig)

# potfoundry/geometry.py — vNEXT2
# Geometry core with style-agnostic twist/spin and optimized mesh build.
from __future__ import annotations
from dataclasses import dataclass
from typing import Callable, Dict, Tuple, Optional, Any, Union
from pathlib import Path
import math
import numpy as np
from functools import lru_cache
import numpy.typing as npt


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
    z: float, H: float, Rb: float, Rt: float, expn: float, opts: Dict[str, Any]
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
    r_outer_fn: Optional[Callable[..., Any]],
    theta: Union[float, npt.NDArray[np.float64]],
    z: float,
    r0: Union[float, npt.NDArray[np.float64]],
    H: float,
    style_opts: Dict[str, Any],
) -> Union[float, npt.NDArray[np.float64]]:
    """Adapter for r_outer_fn callables.

    Accepts either scalar theta or an ndarray of thetas. If `r_outer_fn` is None,
    returns the unmodulated base radius (r0) for the given inputs. If the
    provided callable supports vectorized inputs (ndarray), we pass them
    through; otherwise we fall back to element-wise evaluation and coerce the
    result to an ndarray of floats.
    """
    if r_outer_fn is None:
        return np.asarray(r0, dtype=float) if isinstance(theta, np.ndarray) else float(r0)

    # Vectorized theta path
    if isinstance(theta, np.ndarray):
        try:
            res = r_outer_fn(theta, z, r0, H, style_opts)
            return np.asarray(res, dtype=float)
        except Exception:
            # Fallback: call per-element
            out = [float(r_outer_fn(float(t), float(z), float(r0) if not isinstance(r0, np.ndarray) else float(r0[i]), float(H), style_opts)) for i, t in enumerate(theta)]
            return np.array(out, dtype=float)

    # Scalar theta path
    try:
        res = r_outer_fn(float(theta), float(z), float(r0) if not isinstance(r0, np.ndarray) else float(r0), float(H), style_opts)
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
) -> Tuple[npt.NDArray[np.float64], npt.NDArray[np.float64], npt.NDArray[np.float64]]:
    """Cache theta grid computations for performance."""
    thetas = np.linspace(0.0, TAU, n_theta, endpoint=False)
    return thetas, np.cos(thetas), np.sin(thetas)


def r_base_out(z: float, H: float, Rb: float, Rt: float, expn: float) -> float:
    """Unmodulated outer radius vs height z (0..H), with flare exponent."""
    t = 0.0 if H <= 0 else z / H
    return float(Rb + (Rt - Rb) * (t**expn))


def _compute_normal(
    a: npt.NDArray[np.float64], b: npt.NDArray[np.float64], c: npt.NDArray[np.float64]
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


def _spin_twist_radians(z: float, H: float, opts: Dict[str, Any]) -> float:
    """
    Smooth twist angle (in radians) applied to theta at height z.
    opts (style-agnostic):
      - spin_turns: total revolutions from base to rim (float, default 0.0)
      - spin_phase_deg: constant offset in degrees (float, default 0.0)
      - spin_curve_exp: easing exponent for twist vs height t=z/H (>=0.1, default 1.0)
    """
    if H <= 0:
        return 0.0
    turns = float(opts.get("spin_turns", 0.0))
    if turns == 0.0 and float(opts.get("spin_phase_deg", 0.0)) == 0.0:
        return 0.0
    t = max(0.0, min(1.0, z / H))
    phase_deg = float(opts.get("spin_phase_deg", 0.0))
    curve = max(0.1, float(opts.get("spin_curve_exp", 1.0)))
    return float((phase_deg * math.pi / 180.0) + (turns * TAU) * (t**curve))


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


def r_outer_superformula_blossom(
    theta: float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> float:
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
    rf = superformula_r(theta, m, n1, n2, n3, a=a, b=b)
    return float(r0 * (0.90 + 0.35 * rf))


def r_outer_fourier_bloom(
    theta: float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> float:
    t = z / H if H > 0 else 0.0

    bc8 = float(opts.get("fb_base_cos8_amp", 0.12))
    bc8p = float(opts.get("fb_base_cos8_phase", 0.0))
    bs4 = float(opts.get("fb_base_sin4_amp", 0.05))
    bs4p = float(opts.get("fb_base_sin4_phase", 0.6))
    bc12 = float(opts.get("fb_base_cos12_amp", -0.04))
    bc12p = float(opts.get("fb_base_cos12_phase", 1.3))
    base = (
        1.0
        + bc8 * math.cos(8 * theta + bc8p)
        + bs4 * math.sin(4 * theta + bs4p)
        + bc12 * math.cos(12 * theta + bc12p)
    )

    tc11 = float(opts.get("fb_top_cos11_amp", 0.18))
    tc11p = float(opts.get("fb_top_cos11_phase", 0.5))
    ts7 = float(opts.get("fb_top_sin7_amp", -0.07))
    ts7p = float(opts.get("fb_top_sin7_phase", 0.0))
    tc22 = float(opts.get("fb_top_cos22_amp", 0.05))
    tc22p = float(opts.get("fb_top_cos22_phase", 0.9))
    top = (
        1.0
        + tc11 * math.cos(11 * theta + tc11p)
        + ts7 * math.sin(7 * theta + ts7p)
        + tc22 * math.cos(22 * theta + tc22p)
    )

    f = (1 - t) * base + t * top

    wob_amp = float(opts.get("fb_wobble_amp", 0.06))
    wob_freq = float(opts.get("fb_wobble_freq", 5))
    wob_zgain = float(opts.get("fb_wobble_zgain", 0.5))
    f *= 1.0 + wob_amp * math.sin(wob_freq * theta + TAU * wob_zgain * t)

    strength = float(opts.get("fb_strength", 1.0))
    return float(r0 * (1.0 + (f - 1.0) * strength))


def r_outer_spiral_ridges(
    theta: float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> float:
    t = z / H if H > 0 else 0.0
    k = int(opts.get("spiral_k", 9))
    turns = float(opts.get("spiral_turns", 1.15))
    phase = TAU * turns * t
    amp_min = float(opts.get("spiral_amp_min", 0.15))
    amp_max = float(opts.get("spiral_amp_max", 0.25))
    amp_curve = float(opts.get("spiral_amp_curve", 1.3))
    amp = amp_min + (amp_max - amp_min) * (t**amp_curve)

    f = 1.0 + amp * math.sin(k * theta + phase)

    groove_amp = float(opts.get("spiral_groove_amp", 0.04))
    groove_mult = float(opts.get("spiral_groove_mult", 3.0))
    phase_mult = float(opts.get("spiral_phase_mult", 1.7))
    f += groove_amp * math.sin(groove_mult * k * theta + phase_mult * phase)
    return float(r0 * f)


def r_outer_superellipse_morph(
    theta: float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> float:
    t = z / H if H > 0 else 0.0
    m_base = float(opts.get("se_m_base", 2.0))
    m_top = float(opts.get("se_m_top", 5.5))
    m_curve = float(opts.get("se_m_curve_exp", 1.1))
    m_exp = m_base + (m_top - m_base) * (t**m_curve)

    c = abs(math.cos(theta)) ** m_exp
    s = abs(math.sin(theta)) ** m_exp
    rf = (c + s) ** (-1.0 / max(m_exp, 1e-9))

    c4a = float(opts.get("se_c4_amp", 0.08))
    c4p = float(opts.get("se_c4_phase_deg", 23)) * math.pi / 180.0
    c8a = float(opts.get("se_c8_amp", 0.03))
    c8p = float(opts.get("se_c8_phase_deg", 0)) * math.pi / 180.0
    rf *= 1.0 + c4a * math.cos(4 * theta + c4p) + c8a * math.cos(8 * theta + c8p)
    return float(r0 * rf)


def r_outer_harmonic_ripple(
    theta: float, z: float, r0: float, H: float, opts: Dict[str, Any]
) -> float:
    t = z / H if H > 0 else 0.0
    petals = int(opts.get("hr_petals", 7))
    pet_amp = float(opts.get("hr_petal_amp", 0.16))
    pet_ph = float(opts.get("hr_petal_phase_deg", 17)) * math.pi / 180.0
    pet_zg = float(opts.get("hr_petal_zgain", 0.6))

    rip_freq = int(opts.get("hr_ripple_freq", 31))
    rip_amp = float(opts.get("hr_ripple_amp", 0.03))
    rip_ph = float(opts.get("hr_ripple_phase_deg", 0)) * math.pi / 180.0
    rip_zg = float(opts.get("hr_ripple_zgain", 1.0))

    bell = float(opts.get("hr_bell", 0.05))

    f = 1.0 + pet_amp * math.cos(petals * theta + pet_ph + TAU * pet_zg * t)
    f *= 1.0 + rip_amp * math.sin(rip_freq * theta + rip_ph + TAU * rip_zg * t)
    f *= 1.0 + bell * math.exp(-((t - 0.5) ** 2) / 0.04)
    return float(r0 * f)


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
    r_outer_fn: Optional[Callable[[float, float, float, float, Dict[str, Any]], float]],
    style_opts: Dict[str, Any],
) -> Tuple[npt.NDArray[np.float64], npt.NDArray[np.int32], Dict[str, Any]]:
    """
    Return (vertices [N,3], faces [M,3], diagnostics).
    Parity: sample r_outer_fn at (theta + twist) for preview/export match.
    Vectorization (stage 1): theta dimension is fully vectorized
    faces built by numpy indexing.
    """
    assert H > 0 and Rt > 0 and Rb > 0 and t_wall > 0 and t_bottom >= 2.0, (
        "Invalid size parameters."
    )
    assert r_drain > 0 and r_drain < (Rb - t_wall - 2.0), (
        "Drain hole too large for base—adjust sizes."
    )

    # Use cached theta grid to avoid recomputing across calls
    thetas, cos_th, sin_th = _theta_grid_cached(int(n_theta))
    z_outer = np.linspace(0.0, H, n_z + 1)
    z_inner = np.linspace(t_bottom, H, n_z + 1)

    verts: list[np.ndarray] = []
    faces: list[tuple[int, int, int]] = []

    def add_ring_xy(r_vals: np.ndarray, z: float, cTw: float, sTw: float) -> np.ndarray:
        # Vectorized ring placement with precomputed cos/sin(theta) and twist
        cx = cos_th * cTw - sin_th * sTw
        sy = sin_th * cTw + cos_th * sTw
        xs = r_vals * cx
        ys = r_vals * sy
        start_index = len(verts)
        for x, y in zip(xs, ys):
            verts.append(np.array([x, y, z], dtype=float))
        return np.arange(start_index, start_index + n_theta, dtype=int)

    # ---- Outer wall rings
    outer_idx = np.empty((len(z_outer), n_theta), dtype=int)
    for i, z in enumerate(z_outer):
        twist = _spin_twist_radians(z, H, style_opts)
        cTw, sTw = float(np.cos(twist)), float(np.sin(twist))
        r0 = base_radius(z, H, Rb, Rt, expn, style_opts)
        r_vals = np.asarray(_call_r_outer(r_outer_fn, thetas + twist, z, r0, H, style_opts), dtype=float)
        outer_idx[i] = add_ring_xy(r_vals, z, cTw, sTw)

    # Vectorized faces for outer wall
    rows = len(z_outer) - 1
    j = np.arange(n_theta, dtype=int)
    jn = (j + 1) % n_theta
    for i in range(rows):
        v00 = outer_idx[i, j]
        v01 = outer_idx[i, jn]
        v10 = outer_idx[i + 1, j]
        v11 = outer_idx[i + 1, jn]
        faces.extend(list(zip(list(v00), list(v10), list(v11))))
        faces.extend(list(zip(list(v00), list(v11), list(v01))))

    # ---- Inner wall rings (clamp near drain)
    inner_idx = np.empty((len(z_inner), n_theta), dtype=int)
    clamp_count = 0
    total_inner_samples = len(z_inner) * n_theta
    for i, z in enumerate(z_inner):
        twist = _spin_twist_radians(z, H, style_opts)
        cTw, sTw = float(np.cos(twist)), float(np.sin(twist))
        r0 = base_radius(z, H, Rb, Rt, expn, style_opts)
        r_out_vals = np.asarray(_call_r_outer(r_outer_fn, thetas + twist, z, r0, H, style_opts), dtype=float)
        r_in_vals = r_out_vals - t_wall
        min_allowed = r_drain + 1.0
        clamped = r_in_vals < min_allowed
        clamp_count += int(np.count_nonzero(clamped))
        r_in_vals[clamped] = min_allowed
        inner_idx[i] = add_ring_xy(r_in_vals, z, cTw, sTw)

    # Vectorized faces for inner wall (reverse winding)
    rows_in = len(z_inner) - 1
    for i in range(rows_in):
        v00 = inner_idx[i, j]
        v01 = inner_idx[i, jn]
        v10 = inner_idx[i + 1, j]
        v11 = inner_idx[i + 1, jn]
        faces.extend(list(zip(list(v00), list(v11), list(v10))))
        faces.extend(list(zip(list(v00), list(v01), list(v11))))

    # ---- Rim cap
    outer_top = outer_idx[-1]
    inner_top = inner_idx[-1]
    v00 = outer_top[j]
    v01 = outer_top[jn]
    vi0 = inner_top[j]
    vi1 = inner_top[jn]
    faces.extend(list(zip(list(v00), list(vi0), list(vi1))))
    faces.extend(list(zip(list(v00), list(vi1), list(v01))))

    # ---- Drain circles (untwisted)
    drain_under_list: list[int] = []
    drain_top_list: list[int] = []
    # Vectorized drain circle placement using cached cos/sin
    for c, s in zip(cos_th, sin_th):
        x0 = r_drain * float(c)
        y0 = r_drain * float(s)
        drain_under_list.append(len(verts))
        verts.append(np.array([x0, y0, 0.0], dtype=float))
        drain_top_list.append(len(verts))
        verts.append(np.array([x0, y0, float(t_bottom)], dtype=float))
    drain_under_arr = np.array(drain_under_list, dtype=int)
    drain_top_arr = np.array(drain_top_list, dtype=int)
    outer_bottom = outer_idx[0]
    inner_bottom = inner_idx[0]

    # Bottom underside (outer bottom ring -> drain under ring)
    v00 = outer_bottom[j]
    v01 = outer_bottom[jn]
    vd0 = drain_under_arr[j]
    vd1 = drain_under_arr[jn]
    faces.extend(list(zip(list(v00), list(vd1), list(vd0))))
    faces.extend(list(zip(list(v00), list(v01), list(vd1))))

    # Top of bottom slab (inner bottom ring -> drain top ring)
    vi0 = inner_bottom[j]
    vi1 = inner_bottom[jn]
    vd0 = drain_top_arr[j]
    vd1 = drain_top_arr[jn]
    faces.extend(list(zip(list(vi0), list(vi1), list(vd1))))
    faces.extend(list(zip(list(vi0), list(vd1), list(vd0))))

    # Drain cylinder wall
    v0b = drain_under_arr[j]
    v1b = drain_under_arr[jn]
    v0t = drain_top_arr[j]
    v1t = drain_top_arr[jn]
    faces.extend(list(zip(list(v0b), list(v0t), list(v1t))))
    faces.extend(list(zip(list(v0b), list(v1t), list(v1b))))

    # Diagnostics
    def ring_od(ids):
        pts = np.array([verts[k] for k in ids])
        rs = np.linalg.norm(pts[:, :2], axis=1)
        return 2.0 * float(np.max(rs))

    est_top_od = ring_od(outer_top)
    est_bottom_od = ring_od(outer_bottom)
    clamp_ratio = clamp_count / max(1, total_inner_samples)

    diagnostics = dict(
        clamp_ratio_at_bottom=float(clamp_ratio),
        estimated_top_od_mm=float(est_top_od),
        estimated_bottom_od_mm=float(est_bottom_od),
    )
    return np.array(verts, dtype=float), np.array(faces, dtype=int), diagnostics


from typing import Any as _Any

plt: _Any | None = None
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
    style_opts: Dict,
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

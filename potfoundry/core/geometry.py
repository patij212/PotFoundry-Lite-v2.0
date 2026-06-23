# potfoundry/geometry.py — vNEXT2
# Geometry core with style-agnostic twist/spin and optimized mesh build.
from __future__ import annotations
from dataclasses import dataclass
from typing import Callable, Dict
import math
import numpy as np
from functools import lru_cache



__all__ = [
    "MeshQuality", "PotDefaults", "STYLES",
    "r_base_out", "build_pot_mesh",
    "save_preview_png",
    "write_ascii_stl",  # deprecated - use write_stl_binary instead
]


# Shared base profile (outer radius vs height) with flare-center warp and bell
import math as _m

def base_radius(z: float, H: float, Rb: float, Rt: float, expn: float, opts: Dict) -> float:
    if H <= 0:
        return Rb
    # normalized height
    t = 0.0 if H == 0 else max(0.0, min(1.0, z / H))
    # Flare center warp (logistic remap of t)
    c = float(opts.get('flare_center', 0.5))
    k = float(opts.get('flare_sharp', 6.0))
    def _sig(x: float) -> float:
        return 1.0 / (1.0 + _m.exp(-k * (x - c)))
    s0 = _sig(0.0); s1 = _sig(1.0)
    tw = (_sig(t) - s0) / (s1 - s0 + 1e-9)
    r = Rb + (Rt - Rb) * (tw ** float(expn))
    # Optional mid-height bell
    amp = float(opts.get('bell_amp', 0.0))
    if amp != 0.0:
        mu = float(opts.get('bell_center', 0.5))
        width = max(0.05, float(opts.get('bell_width', 0.22)))
        sigma = max(1e-3, width * 0.5)
        g = _m.exp(-0.5 * ((t - mu) / sigma) ** 2)
        r *= (1.0 + amp * g)
    return float(r)




# -----------------------------
# Dataclasses / configuration
# -----------------------------

@dataclass
class MeshQuality:
    """Mesh resolution. Higher -> smoother -> more faces -> larger STL."""
    n_theta: int = 168   # angular divisions around the pot
    n_z: int = 84        # vertical divisions along the height


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
def _theta_grid_cached(n_theta: int):
    thetas = np.linspace(0.0, TAU, n_theta, endpoint=False)
    return thetas, np.cos(thetas), np.sin(thetas)


def r_base_out(z: float, H: float, Rb: float, Rt: float, expn: float) -> float:
    """Unmodulated outer radius vs height z (0..H), with flare exponent."""
    t = 0.0 if H <= 0 else z / H
    return Rb + (Rt - Rb) * (t ** expn)

def _compute_normal(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    n = np.cross(b - a, c - a)
    norm = np.linalg.norm(n)
    if norm == 0:
        return np.array([0.0, 0.0, 0.0], dtype=float)
    return n / norm

def write_ascii_stl(path, name: str, verts: np.ndarray, faces: np.ndarray) -> None:
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
        stacklevel=2
    )
    with open(path, "w") as f:
        f.write(f"solid {name}\n")
        for ia, ib, ic in faces:
            a = verts[ia]; b = verts[ib]; c = verts[ic]
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
    turns = float(opts.get("spin_turns", 0.0))
    if turns == 0.0 and float(opts.get("spin_phase_deg", 0.0)) == 0.0:
        return 0.0
    t = max(0.0, min(1.0, z / H))
    phase_deg = float(opts.get("spin_phase_deg", 0.0))
    curve = max(0.1, float(opts.get("spin_curve_exp", 1.0)))
    return (phase_deg * math.pi / 180.0) + (turns * TAU) * (t ** curve)


# -----------------------------
# Styles (outer radius profiles)
# -----------------------------

def superformula_r(theta, m: float, n1: float, n2: float, n3: float,
                   a: float = 1.0, b: float = 1.0):
    """Gielis superformula in polar. Supports scalar or numpy array theta."""
    th = np.asarray(theta, dtype=float)
    c = np.abs(np.cos(m * th / 4.0) / a) ** n2
    s = np.abs(np.sin(m * th / 4.0) / b) ** n3
    denom = (c + s) ** (1.0 / max(n1, 1e-9))
    with np.errstate(divide='ignore', invalid='ignore'):
        out = np.where(denom == 0, 0.0, 1.0 / denom)
    # Return scalar for scalar input to preserve API
    return float(out) if np.isscalar(theta) else out

def r_outer_superformula_blossom(theta, z: float, r0: float, H: float, opts: Dict):
    t = z / H if H > 0 else 0.0
    m_base = float(opts.get("sf_m_base", 6.0))
    m_top  = float(opts.get("sf_m_top", 10.0))
    m_curve = float(opts.get("sf_m_curve_exp", 1.2))
    m = m_base + (m_top - m_base) * (t ** m_curve)

    n1_base = float(opts.get("sf_n1", 0.35))
    n1_top  = float(opts.get("sf_n1_top", 0.50))
    n2_base = float(opts.get("sf_n2", 0.8))
    n2_top  = float(opts.get("sf_n2_top", 1.4))
    n3_base = float(opts.get("sf_n3", 0.8))
    n3_top  = float(opts.get("sf_n3_top", 0.8))

    n1 = n1_base + (n1_top - n1_base) * t
    n2 = n2_base + (n2_top - n2_base) * t
    n3 = n3_base + (n3_top - n3_base) * t

    a = float(opts.get("sf_a", 1.0))
    b = float(opts.get("sf_b", 1.0))
    rf = superformula_r(theta, m, n1, n2, n3, a=a, b=b)
    return r0 * (0.90 + 0.35 * rf)

def r_outer_fourier_bloom(theta, z: float, r0: float, H: float, opts: Dict):
    t = z / H if H > 0 else 0.0

    bc8  = float(opts.get("fb_base_cos8_amp", 0.12))
    bc8p = float(opts.get("fb_base_cos8_phase", 0.0))
    bs4  = float(opts.get("fb_base_sin4_amp", 0.05))
    bs4p = float(opts.get("fb_base_sin4_phase", 0.6))
    bc12 = float(opts.get("fb_base_cos12_amp", -0.04))
    bc12p= float(opts.get("fb_base_cos12_phase", 1.3))
    th = np.asarray(theta, dtype=float)
    base = 1.0 + bc8 * np.cos(8*th + bc8p) + bs4 * np.sin(4*th + bs4p) + bc12 * np.cos(12*th + bc12p)

    tc11  = float(opts.get("fb_top_cos11_amp", 0.18))
    tc11p = float(opts.get("fb_top_cos11_phase", 0.5))
    ts7   = float(opts.get("fb_top_sin7_amp", -0.07))
    ts7p  = float(opts.get("fb_top_sin7_phase", 0.0))
    tc22  = float(opts.get("fb_top_cos22_amp", 0.05))
    tc22p = float(opts.get("fb_top_cos22_phase", 0.9))
    top   = 1.0 + tc11 * np.cos(11*th + tc11p) + ts7 * np.sin(7*th + ts7p) + tc22 * np.cos(22*th + tc22p)

    f = (1 - t) * base + t * top

    wob_amp   = float(opts.get("fb_wobble_amp", 0.06))
    wob_freq  = float(opts.get("fb_wobble_freq", 5))
    wob_zgain = float(opts.get("fb_wobble_zgain", 0.5))
    f *= (1.0 + wob_amp * np.sin(wob_freq * th + TAU * wob_zgain * t))

    strength = float(opts.get("fb_strength", 1.0))
    return r0 * (1.0 + (f - 1.0) * strength)

def r_outer_spiral_ridges(theta, z: float, r0: float, H: float, opts: Dict):
    t = z / H if H > 0 else 0.0
    k = int(opts.get("spiral_k", 9))
    turns = float(opts.get("spiral_turns", 1.15))
    phase = TAU * turns * t
    amp_min = float(opts.get("spiral_amp_min", 0.15))
    amp_max = float(opts.get("spiral_amp_max", 0.25))
    amp_curve = float(opts.get("spiral_amp_curve", 1.3))
    amp = amp_min + (amp_max - amp_min) * (t ** amp_curve)

    th = np.asarray(theta, dtype=float)
    f = 1.0 + amp * np.sin(k * th + phase)

    groove_amp  = float(opts.get("spiral_groove_amp", 0.04))
    groove_mult = float(opts.get("spiral_groove_mult", 3.0))
    phase_mult  = float(opts.get("spiral_phase_mult", 1.7))
    f += groove_amp * np.sin(groove_mult * k * th + phase_mult * phase)
    return r0 * f

def r_outer_superellipse_morph(theta, z: float, r0: float, H: float, opts: Dict):
    t = z / H if H > 0 else 0.0
    m_base = float(opts.get("se_m_base", 2.0))
    m_top  = float(opts.get("se_m_top", 5.5))
    m_curve = float(opts.get("se_m_curve_exp", 1.1))
    m_exp = m_base + (m_top - m_base) * (t ** m_curve)

    th = np.asarray(theta, dtype=float)
    c = np.abs(np.cos(th)) ** m_exp
    s = np.abs(np.sin(th)) ** m_exp
    rf = (c + s) ** (-1.0 / max(m_exp, 1e-9))

    c4a = float(opts.get("se_c4_amp", 0.08))
    c4p = float(opts.get("se_c4_phase_deg", 23)) * math.pi / 180.0
    c8a = float(opts.get("se_c8_amp", 0.03))
    c8p = float(opts.get("se_c8_phase_deg", 0)) * math.pi / 180.0
    rf *= (1.0 + c4a * np.cos(4*th + c4p) + c8a * np.cos(8*th + c8p))
    return r0 * rf

def r_outer_harmonic_ripple(theta, z: float, r0: float, H: float, opts: Dict):
    t = z / H if H > 0 else 0.0
    petals  = int(opts.get("hr_petals", 7))
    pet_amp = float(opts.get("hr_petal_amp", 0.16))
    pet_ph  = float(opts.get("hr_petal_phase_deg", 17)) * math.pi / 180.0
    pet_zg  = float(opts.get("hr_petal_zgain", 0.6))

    rip_freq = int(opts.get("hr_ripple_freq", 31))
    rip_amp  = float(opts.get("hr_ripple_amp", 0.03))
    rip_ph   = float(opts.get("hr_ripple_phase_deg", 0)) * math.pi / 180.0
    rip_zg   = float(opts.get("hr_ripple_zgain", 1.0))

    bell     = float(opts.get("hr_bell", 0.05))

    th = np.asarray(theta, dtype=float)
    f = (1.0 + pet_amp * np.cos(petals*th + pet_ph + TAU * pet_zg * t))
    f *= (1.0 + rip_amp * np.sin(rip_freq*th + rip_ph + TAU * rip_zg * t))
    f *= (1.0 + bell * np.exp(-((t - 0.5) ** 2) / 0.04))
    return r0 * f

STYLES = {
    "SuperformulaBlossom": (r_outer_superformula_blossom, "Petals via Gielis superformula; sharpen toward rim."),
    "FourierBloom":        (r_outer_fourier_bloom,       "Floral profile from blended harmonics."),
    "SpiralRidges":        (r_outer_spiral_ridges,       "Rising helical ribs with fine grooves."),
    "SuperellipseMorph":   (r_outer_superellipse_morph,  "Circle → rounded square → soft diamond vs height."),
    "HarmonicRipple":      (r_outer_harmonic_ripple,     "Petals + ripples + gentle mid-height bell."),
}


# -----------------------------
# Mesh builder (watertight)
# -----------------------------

def build_pot_mesh(H: float, Rt: float, Rb: float, t_wall: float, t_bottom: float, r_drain: float,
                   expn: float, n_theta: int, n_z: int,
                   r_outer_fn: Callable[[np.ndarray | float, float, float, float, dict], np.ndarray | float],
                   style_opts: dict) -> tuple[np.ndarray, np.ndarray, dict]:
    """
    Return (vertices [N,3], faces [M,3], diagnostics).
    Parity: sample r_outer_fn at (theta + twist) for preview/export match.
    Vectorization (stage 1): theta dimension is fully vectorized; faces built by numpy indexing.
    """
    assert H > 0 and Rt > 0 and Rb > 0 and t_wall > 0 and t_bottom >= 2.0, "Invalid size parameters."
    assert r_drain > 0 and r_drain < (Rb - t_wall - 2.0), "Drain hole too large for base—adjust sizes."

    # Use cached theta grid (angles, cos, sin) to avoid recomputation
    thetas, cos_th, sin_th = _theta_grid_cached(int(n_theta))
    z_outer = np.linspace(0.0, H, n_z + 1)
    z_inner = np.linspace(t_bottom, H, n_z + 1)

    verts: list[tuple[float, float, float]] = []
    faces_out_parts: list[np.ndarray] = []

    def add_ring_xy(r_vals: np.ndarray, z: float, cTw: float, sTw: float) -> np.ndarray:
        # Rotate precomputed cos/sin by twist: cos(θ+tw)=cosθ·cosTw - sinθ·sinTw; sin(θ+tw)=sinθ·cosTw + cosθ·sinTw
        cx =  cos_th * cTw - sin_th * sTw
        sy =  sin_th * cTw + cos_th * sTw
        xs = (r_vals * cx).tolist()
        ys = (r_vals * sy).tolist()
        start_index = len(verts)
        from itertools import repeat
        verts.extend(zip(xs, ys, repeat(float(z), n_theta)))
        return np.arange(start_index, start_index + n_theta, dtype=int)

    # ---- Outer wall rings
    outer_idx = np.empty((len(z_outer), n_theta), dtype=int)
    est_top_od = None
    est_bottom_od = None
    # No style-specific fast path by default; rely on vectorized style_fn

    for i, z in enumerate(z_outer):
        twist = _spin_twist_radians(z, H, style_opts)
        cTw, sTw = float(np.cos(twist)), float(np.sin(twist))
        r0 = base_radius(z, H, Rb, Rt, expn, style_opts)
        # Sample style at (theta + twist) for parity with rotated placement (vectorized)
        r_vals = np.asarray(r_outer_fn(thetas + twist, z, r0, H, style_opts), dtype=float)
        outer_idx[i] = add_ring_xy(r_vals, z, cTw, sTw)
        # Track estimated ODs without scanning verts
        max_r = float(np.max(r_vals)) if r_vals.size else 0.0
        if i == 0:
            est_bottom_od = 2.0 * max_r
        if i == (len(z_outer) - 1):
            est_top_od = 2.0 * max_r

    # Vectorized faces for outer wall
    rows = len(z_outer) - 1
    j = np.arange(n_theta, dtype=int)
    jn = (j + 1) % n_theta
    v00 = outer_idx[:-1, :][:, j]
    v01 = outer_idx[:-1, :][:, jn]
    v10 = outer_idx[1:, :][:, j]
    v11 = outer_idx[1:, :][:, jn]
    # Wound CCW as seen from outside -> face normals point radially outward.
    tri1 = np.stack([v00, v11, v10], axis=2).reshape(-1, 3)
    tri2 = np.stack([v00, v01, v11], axis=2).reshape(-1, 3)
    faces_out_parts.append(tri1)
    faces_out_parts.append(tri2)

    # ---- Inner wall rings (clamp near drain)
    inner_idx = np.empty((len(z_inner), n_theta), dtype=int)
    clamp_count = 0; total_inner_samples = len(z_inner) * n_theta
    for i, z in enumerate(z_inner):
        twist = _spin_twist_radians(z, H, style_opts)
        cTw, sTw = float(np.cos(twist)), float(np.sin(twist))
        r0 = base_radius(z, H, Rb, Rt, expn, style_opts)
        r_out_vals = np.asarray(r_outer_fn(thetas + twist, z, r0, H, style_opts), dtype=float)
        r_in_vals = r_out_vals - t_wall
        min_allowed = r_drain + 1.0
        clamped = r_in_vals < min_allowed
        clamp_count += int(np.count_nonzero(clamped))
        r_in_vals[clamped] = min_allowed
        inner_idx[i] = add_ring_xy(r_in_vals, z, cTw, sTw)

    # Vectorized faces for inner wall (reverse winding)
    rows_in = len(z_inner) - 1
    vi00 = inner_idx[:-1, :][:, j]
    vi01 = inner_idx[:-1, :][:, jn]
    vi10 = inner_idx[1:, :][:, j]
    vi11 = inner_idx[1:, :][:, jn]
    # Cavity wall: normals point radially inward (away from the solid material).
    tri_in1 = np.stack([vi00, vi10, vi11], axis=2).reshape(-1, 3)
    tri_in2 = np.stack([vi00, vi11, vi01], axis=2).reshape(-1, 3)
    faces_out_parts.append(tri_in1)
    faces_out_parts.append(tri_in2)

    # ---- Rim cap
    outer_top = outer_idx[-1]; inner_top = inner_idx[-1]
    v00 = outer_top[j]; v01 = outer_top[jn]
    vi0 = inner_top[j]; vi1 = inner_top[jn]
    # Rim annulus faces upward (+z), away from the wall below it.
    tri_rim1 = np.stack([outer_top[j], inner_top[jn], inner_top[j]], axis=1)
    tri_rim2 = np.stack([outer_top[j], outer_top[jn], inner_top[jn]], axis=1)
    faces_out_parts.append(tri_rim1)
    faces_out_parts.append(tri_rim2)

    # ---- Drain circles (untwisted)
    drain_under = []; drain_top = []
    # Vectorized drain circles using cached cos/sin
    for c, s in zip(cos_th, sin_th):
        x0 = r_drain * float(c); y0 = r_drain * float(s)
        drain_under.append(len(verts)); verts.append((x0, y0, 0.0))
        drain_top.append(len(verts));   verts.append((x0, y0, float(t_bottom)))
    drain_under = np.array(drain_under, dtype=int); drain_top = np.array(drain_top, dtype=int)
    outer_bottom = outer_idx[0]; inner_bottom = inner_idx[0]

    # Bottom underside (outer bottom ring -> drain under ring)
    v00 = outer_bottom[j]; v01 = outer_bottom[jn]
    vd0 = drain_under[j];  vd1 = drain_under[jn]
    # Underside of the base faces downward (-z).
    tri_bot1 = np.stack([outer_bottom[j], drain_under[j], drain_under[jn]], axis=1)
    tri_bot2 = np.stack([outer_bottom[j], drain_under[jn], outer_bottom[jn]], axis=1)
    faces_out_parts.append(tri_bot1)
    faces_out_parts.append(tri_bot2)

    # Top of bottom slab (inner bottom ring -> drain top ring)
    vi0 = inner_bottom[j]; vi1 = inner_bottom[jn]
    vd0 = drain_top[j];    vd1 = drain_top[jn]
    tri_top1 = np.stack([inner_bottom[j], inner_bottom[jn], drain_top[jn]], axis=1)
    tri_top2 = np.stack([inner_bottom[j], drain_top[jn], drain_top[j]], axis=1)
    faces_out_parts.append(tri_top1)
    faces_out_parts.append(tri_top2)

    # Drain cylinder wall
    v0b = drain_under[j]; v1b = drain_under[jn]
    v0t = drain_top[j];   v1t = drain_top[jn]
    tri_cyl1 = np.stack([drain_under[j], drain_top[j], drain_top[jn]], axis=1)
    tri_cyl2 = np.stack([drain_under[j], drain_top[jn], drain_under[jn]], axis=1)
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

    diagnostics = dict(
        clamp_ratio_at_bottom=float(clamp_ratio),
        estimated_top_od_mm=float(est_top_od),
        estimated_bottom_od_mm=float(est_bottom_od),
    )
    faces_arr = np.vstack(faces_out_parts).astype(int, copy=False)
    return np.array(verts, dtype=float), faces_arr, diagnostics
try:
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
except Exception:
    plt = None

def save_preview_png(path, H: float, Rt: float, Rb: float, expn: float,
                     n_theta: int, n_z: int, r_outer_fn, style_opts: Dict) -> None:
    if plt is None:
        return
    th_samp = max(144, min(360, int(n_theta * 1.25)))
    z_samp  = max(64,  min(160, int(n_z * 1.25)))
    thetas = np.linspace(0.0, TAU, th_samp, endpoint=False)
    zs = np.linspace(0.0, H, z_samp)
    X = np.zeros((len(zs), len(thetas))); Y = np.zeros_like(X); Z = np.zeros_like(X)
    base_cos = np.cos(thetas); base_sin = np.sin(thetas)
    for i, z in enumerate(zs):
        r0 = base_radius(z, H, Rb, Rt, expn, style_opts)
        twist = _spin_twist_radians(z, H, style_opts)
        cTw, sTw = math.cos(twist), math.sin(twist)
        cx =  base_cos * cTw - base_sin * sTw
        sy =  base_sin * cTw + base_cos * sTw
        rext = np.asarray(r_outer_fn(thetas + twist, z, r0, H, style_opts), dtype=float)
        X[i, :] = rext * cx; Y[i, :] = rext * sy; Z[i, :] = z
    fig = plt.figure()
    ax = fig.add_subplot(111, projection='3d')
    ax.plot_surface(X, Y, Z, rstride=1, cstride=1, linewidth=0.0, antialiased=True)
    ax.set_xlabel("X (mm)"); ax.set_ylabel("Y (mm)"); ax.set_zlabel("Z (mm)")
    ax.set_title(path.stem)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=180, bbox_inches="tight")
    plt.close(fig)

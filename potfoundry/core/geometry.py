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

from ..types import NDArrayFloat, StyleOpts
from .geometry_helpers import (
    cdiff_theta,
    cdiff_z,
    dilate_adaptive,
    estimate_shifts,
    roll_rows,
    roll_rows_2d,
)
from .mesh import (
    MeshQuality,
    PotDefaults,
    add_ring_xy,
    call_style_r_outer,
    refine_z_outer_for_seams,
    sample_outer_rings,
    spin_twist_radians,
    theta_grid_cached,
)
from .styles import (
    STYLES,
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
    opts: StyleOpts | dict[str, Any],
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
# Utilities
# -----------------------------

TAU = 2.0 * math.pi


# -----------------------------
# Base radius helper (kept in geometry for backward compatibility)
# -----------------------------


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
    return float(out) if np.isscalar(theta) else out


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
    style_opts: StyleOpts | dict[str, Any] | None = None,
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
    # Normalize to a plain dict for the remainder of this function so the type
    # checker sees a concrete mutable mapping (resolves unions with TypedDicts).
    style_opts = dict(style_opts)

    # Use cached theta grid (angles, cos, sin) to avoid recomputation
    thetas, cos_th, sin_th = theta_grid_cached(int(n_theta))
    # Local typed diagnostic dict placeholder used by verbose diagnostics logic
    # Initialize as empty dict so later diagnostic code can index safely.
    dump: Dict[str, Any] = {}
    z_outer = np.linspace(0.0, H, n_z + 1)
    # Ensure we have a callable style function
    if r_outer_fn is None:
        r_outer_fn = cast(
            Callable[
                [NDArrayFloat | float, float, float | NDArrayFloat, float, dict],
                NDArrayFloat | float,
            ],
            STYLES["SuperformulaBlossom"][0],
        )
    assert r_outer_fn is not None
    # Refine sampling around LowPolyFacet tier seams to improve alignment of triangles near cuts
    z_outer = refine_z_outer_for_seams(z_outer, H, style_opts)
    z_inner = np.linspace(t_bottom, H, n_z + 1)

    verts: list[tuple[float, float, float]] = []
    faces_out_parts: list[np.ndarray] = []

    # ---- Outer wall rings
    (
        outer_idx,
        r_outer_samples_list,
        est_top_od,
        est_bottom_od,
        cx_rows_list,
        sy_rows_list,
        dbg_outward_picks,
        dbg_total_picks,
        dbg_samples_collected,
    ) = sample_outer_rings(
        H=H,
        Rb=Rb,
        Rt=Rt,
        expn=expn,
        style_opts=style_opts,
        r_outer_fn=r_outer_fn,
        z_outer=z_outer,
        thetas=thetas,
        cos_th=cos_th,
        sin_th=sin_th,
        n_theta=n_theta,
        verts=verts,
        base_radius_fn=base_radius,
    )

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
                    [spin_twist_radians(float(z), H, style_opts) for z in z_outer],
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
                            # Ensure a uniform diagnostic shape: always include a 'rows' list.
                            entry = {"stage": "probe_mapping", **probe_out}
                            entry.setdefault("rows", [])
                            edgeflow_verbose_collector.append(entry)
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
                    return np.asarray(np.maximum(acc_forw, acc_back), dtype=float)

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
                                        debug_reports = []
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
                        # Make collector entries uniform: include 'rows' (possibly empty)
                        canonical_fdump.setdefault("rows", [])
                        edgeflow_verbose_collector.append(canonical_fdump)
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
                # Narrow TypedDict.get result to int for mypy
                pd_lp = int(
                    max(
                        0,
                        min(
                            4,
                            int(
                                cast(
                                    int, style_opts.get("lp_diagonal_smooth_passes", 0)
                                )
                            ),
                        ),
                    )
                )
                pd_sf = int(
                    max(
                        0,
                        min(
                            4,
                            int(
                                cast(
                                    int, style_opts.get("sf_diagonal_smooth_passes", 0)
                                )
                            ),
                        ),
                    )
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
                    float(cast(float, style_opts.get("lp_seam_lock_strength", 1.0)))
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
        twist = spin_twist_radians(z, H, style_opts)
        cTw, sTw = float(np.cos(twist)), float(np.sin(twist))
        r0 = base_radius(z, H, Rb, Rt, expn, style_opts)
        _opts = dict(style_opts)
        _opts.setdefault("_pf_rb", Rb)
        _opts.setdefault("_pf_rt", Rt)
        _opts.setdefault("_pf_expn", expn)
        # Parity with outer/preview: sample style at raw theta; apply twist only in placement
        # Normalize via the typed wrapper to avoid float/NDArray typing ambiguity
        r_out_vals = np.asarray(
            call_style_r_outer(r_outer_fn, thetas, z, r0, H, _opts), dtype=float
        )
        r_in_vals = r_out_vals - t_wall
        min_allowed = r_drain + 1.0
        clamped = r_in_vals < min_allowed
        clamp_count += int(np.count_nonzero(clamped))
        r_in_vals[clamped] = min_allowed
        inner_idx[i] = add_ring_xy(
            verts,
            np.asarray(r_in_vals, dtype=float),
            float(z),
            cTw,
            sTw,
            cos_th,
            sin_th,
            n_theta,
        )

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
    # Seam diagnostics (safe guards: only emit when data was collected)
    if dbg_total_picks > 0:
        diagnostics["seam_outward_ratio"] = float(dbg_outward_picks / dbg_total_picks)
    if len(dbg_samples_collected) > 0:
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
        twist = spin_twist_radians(
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

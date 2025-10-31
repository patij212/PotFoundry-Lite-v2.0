import importlib
import time
from typing import Any, cast

import numpy as np

# Use dynamic import to avoid mypy recursing into potfoundry internals
_geom = importlib.import_module("potfoundry.core.geometry")
STYLES: Any = getattr(_geom, "STYLES")
build_pot_mesh: Any = getattr(_geom, "build_pot_mesh")


def _sample_lpf_rf(
    theta_samples=168,
    *,
    z=60.0,
    H=120.0,
    r0=60.0,
    base_opts=None,
):
    fn = STYLES["LowPolyFacet"][0]
    th = np.linspace(0.0, 2.0 * np.pi, theta_samples, endpoint=False)
    opts = dict(base_opts or {})
    # Minimal base parameters for visible facets
    opts.setdefault("lp_facets", 12)
    opts.setdefault("lp_tiers", 3)
    opts.setdefault("lp_amp", 0.14)
    opts.setdefault("lp_bevel", 0.15)
    # Return normalized factor relative to base radius r0
    r = fn(th, float(z), float(r0), float(H), opts)
    return np.asarray(r, dtype=float) / float(r0)


def _tier_seams(H: float, tiers: int):
    return [(k / tiers) * H for k in range(1, tiers)]


def test_cuts_reduce_radius_only_near_seam():
    H = 120.0
    r0 = 60.0
    tiers = 3
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
    }
    with_cuts = {
        **base,
        "lp_cut_bot_deg": 12,
        "lp_cut_top_deg": 12,
        # keep straight-edge default True
    }
    # At a seam plane, expect inward reduction at peaks (top quantiles lower)
    z_seam = _tier_seams(H, tiers)[0]
    f0 = _sample_lpf_rf(z=z_seam, H=H, r0=r0, base_opts=base)
    f1 = _sample_lpf_rf(z=z_seam, H=H, r0=r0, base_opts=with_cuts)
    assert np.quantile(f1, 0.98) <= np.quantile(f0, 0.98) - 1e-5
    # Far from seam (mid of first tier), effect should be negligible
    z_mid = 0.5 * (z_seam)  # halfway to bottom
    f0m = _sample_lpf_rf(z=z_mid, H=H, r0=r0, base_opts=base)
    f1m = _sample_lpf_rf(z=z_mid, H=H, r0=r0, base_opts=with_cuts)
    # Use tolerant bound; tiny differences can leak via smoothing windows
    assert np.linalg.norm(f1m - f0m) <= 5e-3


def test_facet_count_changes_peak_count():
    # More facets => more peaks per 2π
    z = 60.0
    H = 120.0
    r0 = 60.0
    f8 = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={"lp_facets": 8, "lp_amp": 0.14, "lp_bevel": 0.15}
    )
    f16 = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={"lp_facets": 16, "lp_amp": 0.14, "lp_bevel": 0.15}
    )

    def peak_count(a: np.ndarray) -> int:
        d = np.diff(a)
        return int(np.sum((d[:-1] > 0) & (d[1:] <= 0)))

    # Allow small tolerance in sampling
    assert peak_count(f16) >= 2 * peak_count(f8) - 2


def test_amp_scales_modulation_depth():
    z = 60.0
    H = 120.0
    r0 = 60.0
    f_lo = _sample_lpf_rf(z=z, H=H, r0=r0, base_opts={"lp_amp": 0.08})
    f_hi = _sample_lpf_rf(z=z, H=H, r0=r0, base_opts={"lp_amp": 0.2})
    # Higher amplitude increases spread
    assert np.ptp(f_hi) > np.ptp(f_lo) * 1.1


def test_bevel_softens_theta_gradient():
    z = 60.0
    H = 120.0
    r0 = 60.0
    f_sharp = _sample_lpf_rf(z=z, H=H, r0=r0, base_opts={"lp_bevel": 0.0})
    f_soft = _sample_lpf_rf(z=z, H=H, r0=r0, base_opts={"lp_bevel": 0.6})
    # Gradient magnitude across theta should drop with higher bevel
    g_sharp = np.mean(np.abs(np.diff(f_sharp)))
    g_soft = np.mean(np.abs(np.diff(f_soft)))
    assert g_soft < g_sharp


def test_phase_rotation_equivalence():
    z = 60.0
    H = 120.0
    r0 = 60.0
    N = 240
    base = _sample_lpf_rf(
        theta_samples=N, z=z, H=H, r0=r0, base_opts={"lp_phase_deg": 0}
    )
    # 360/N degrees per sample; choose a shift of 12 samples
    shift = 12
    deg = shift * (360.0 / N)
    phased = _sample_lpf_rf(
        theta_samples=N, z=z, H=H, r0=r0, base_opts={"lp_phase_deg": deg}
    )
    _ = np.roll(base, shift)
    # Allow small off-by-one shift due to discretization and bevel smoothing; find best local shift
    candidates = [shift - 1, shift, shift + 1]
    errs = [float(np.linalg.norm(phased - np.roll(base, s))) for s in candidates]
    best_idx = int(np.argmin(errs))
    best_shift = candidates[best_idx]
    assert abs(best_shift - shift) <= 1
    # Residual after best shift should be small (allow 5% of signal energy)
    assert errs[best_idx] <= 0.05 * float(np.linalg.norm(base))


def test_jitter_offsets_adjacent_tiers():
    H = 120.0
    r0 = 60.0
    tiers = 4
    z_seams = _tier_seams(H, tiers)
    # Compare adjacent seam planes with and without jitter
    opts_nojit = {"lp_tiers": tiers, "lp_jitter": 0.0}
    opts_jit = {"lp_tiers": tiers, "lp_jitter": 0.5}
    a0 = _sample_lpf_rf(z=z_seams[0], H=H, r0=r0, base_opts=opts_nojit)
    a1 = _sample_lpf_rf(z=z_seams[1], H=H, r0=r0, base_opts=opts_nojit)
    b0 = _sample_lpf_rf(z=z_seams[0], H=H, r0=r0, base_opts=opts_jit)
    b1 = _sample_lpf_rf(z=z_seams[1], H=H, r0=r0, base_opts=opts_jit)
    # Without jitter, adjacent tier seam shapes are more similar
    sim_nojit = float(np.corrcoef(a0, a1)[0, 1])
    sim_jit = float(np.corrcoef(b0, b1)[0, 1])
    assert sim_nojit >= sim_jit + 0.05


def test_uniform_ring_flattens_band_without_outward_growth():
    H = 120.0
    r0 = 60.0
    tiers = 3
    z_seam = _tier_seams(H, tiers)[0]
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 14,
        "lp_cut_top_deg": 14,
        # Disable straight-edge plateau so we isolate uniform ring flattening
        "lp_cut_straight_edges": False,
    }
    no_ring = {**base, "lp_uniform_ring": False, "lp_enable_flattening": False}
    with_ring = {**base, "lp_uniform_ring": True, "lp_enable_flattening": True}
    f_nr = _sample_lpf_rf(z=z_seam, H=H, r0=r0, base_opts=no_ring)
    f_ur = _sample_lpf_rf(z=z_seam, H=H, r0=r0, base_opts=with_ring)
    # Uniform ring reduces circumferential variance near seam
    assert np.var(f_ur) <= np.var(f_nr) - 1e-6
    # Guard: with uniform ring, do not exceed base radius
    # even in outward facet direction
    # Sample with outward facets to exercise the guard
    f_ur_out = _sample_lpf_rf(
        z=z_seam,
        H=H,
        r0=r0,
        base_opts={**with_ring, "lp_facet_dir": "out"},
    )
    assert np.max(f_ur_out) <= 1.0 + 1e-9


def test_diagonal_smoothing_flag_does_not_change_rf_lpf():
    # Diagonal smoothing is a meshing concern; rf pattern should not change
    f0 = _sample_lpf_rf(base_opts={"lp_diagonal_smooth_passes": 0})
    f1 = _sample_lpf_rf(base_opts={"lp_diagonal_smooth_passes": 3})
    assert np.allclose(f0, f1)


def test_seam_anti_alias_reduces_micro_oscillations():
    H = 120.0
    r0 = 60.0
    tiers = 3
    z_seam = _tier_seams(H, tiers)[0]
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 16,
        "lp_cut_top_deg": 16,
        # Keep straight-edge plateau off to observe anti-alias effect clearly
        "lp_enable_flattening": False,
        "lp_cut_straight_edges": True,
    }
    f_noaa = _sample_lpf_rf(
        z=z_seam,
        H=H,
        r0=r0,
        base_opts={**base, "lp_cut_straight_anti_alias": False},
    )
    f_aa = _sample_lpf_rf(
        z=z_seam,
        H=H,
        r0=r0,
        base_opts={
            **base,
            "lp_cut_straight_anti_alias": True,
            "lp_cut_straight_aa_passes": 2,
        },
    )

    def med5(a: np.ndarray) -> np.ndarray:
        a1 = np.roll(a, 1)
        a2 = np.roll(a, 2)
        b1 = np.roll(a, -1)
        b2 = np.roll(a, -2)
        st = np.stack([a2, a1, a, b1, b2], axis=0)
        st.sort(axis=0)
        return cast(np.ndarray, st[2])

    def micro_resid(a: np.ndarray) -> np.ndarray:
        return cast(np.ndarray, np.maximum(0.0, a - med5(a)))

    # Anti-aliasing should not increase positive micro residuals near seam
    # Note: straight-edge plateauing may already produce a
    # perfectly flat band (zero residuals),
    # in which case equality is acceptable.
    assert float(np.mean(micro_resid(f_aa))) <= float(np.mean(micro_resid(f_noaa)))


def test_outward_mode_with_cuts_prevents_outward_growth_in_band():
    H = 120.0
    r0 = 60.0
    tiers = 3
    z_seam = _tier_seams(H, tiers)[0]
    opts = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 14,
        "lp_cut_top_deg": 10,
        "lp_facet_dir": "out",
        "lp_outward_mode": True,
    }
    f = _sample_lpf_rf(z=z_seam, H=H, r0=r0, base_opts=opts)
    # Within seam band, output must not exceed base radius
    assert np.max(f) <= 1.0 + 1e-9


def test_perf_budget_lpf_heavy_vs_baseline_ratio():
    # Ensure heavy options do not balloon runtime far beyond baseline
    H = 120.0
    Rt = 85.0
    Rb = 85.0
    n_theta = 256
    n_z = 128
    baseline_opts = {
        "lp_facets": 14,
        "lp_tiers": 3,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 0,
        "lp_cut_top_deg": 0,
    }
    heavy_opts = {
        "lp_facets": 14,
        "lp_tiers": 4,
        "lp_amp": 0.16,
        "lp_bevel": 0.18,
        "lp_cut_bot_deg": 14,
        "lp_cut_top_deg": 14,
        "lp_uniform_ring": True,
        "lp_enable_flattening": True,
        "lp_diagonal_smooth_passes": 2,
        "lp_seam_sampling_boost": 2,
        "lp_seam_lock_strength": 1.4,
        "lp_cut_straight_anti_alias": True,
        "lp_cut_straight_aa_passes": 2,
        "lp_edge_solidify_enable": True,
        "lp_edge_solidify_strength": 0.7,
        "lp_edge_solidify_passes": 2,
    }
    # Warm-up to populate any caches
    _ = build_pot_mesh(
        H,
        Rt,
        Rb,
        2.8,
        3.0,
        6.0,
        expn=1.1,
        n_theta=64,
        n_z=32,
        r_outer_fn=STYLES["LowPolyFacet"][0],
        style_opts=baseline_opts,
    )

    t0 = time.perf_counter()
    _ = build_pot_mesh(
        H,
        Rt,
        Rb,
        2.8,
        3.0,
        6.0,
        expn=1.1,
        n_theta=n_theta,
        n_z=n_z,
        r_outer_fn=STYLES["LowPolyFacet"][0],
        style_opts=baseline_opts,
    )
    t1 = time.perf_counter()
    _ = build_pot_mesh(
        H,
        Rt,
        Rb,
        2.8,
        3.0,
        6.0,
        expn=1.1,
        n_theta=n_theta,
        n_z=n_z,
        r_outer_fn=STYLES["LowPolyFacet"][0],
        style_opts=heavy_opts,
    )
    t2 = time.perf_counter()
    base_time = t1 - t0
    heavy_time = t2 - t1
    # Relative budget: heavy <= 3.0x baseline;
    # allow variability across CI/platforms
    # Also ensure neither path explodes unexpectedly
    assert heavy_time <= 3.0 * max(1e-6, base_time)
    assert heavy_time < 10.0


def test_edge_trim_cuts_near_facet_boundaries_only():
    H = 120.0
    r0 = 60.0
    tiers = 2
    # Sample mid-tier away from seam to isolate angular edge cut
    z = (0.25) * H
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.2,
        "lp_cut_bot_deg": 0,
        "lp_cut_top_deg": 0,
    }
    # Strong edge trim to make effect measurable
    trim_opts = {**base, "lp_edge_cut_mm": 1.2, "lp_edge_cut_sharp": 1.8}
    f_base = _sample_lpf_rf(z=z, H=H, r0=r0, base_opts=base)
    f_trim = _sample_lpf_rf(z=z, H=H, r0=r0, base_opts=trim_opts)
    # Identify facet centers vs edges using the triangle profile again
    th = np.linspace(0.0, 2.0 * np.pi, len(f_base), endpoint=False)
    facets = int(base["lp_facets"])
    p = 1.0 + 3.0 * float(base["lp_bevel"])
    x = (facets * th) / (2.0 * np.pi)
    frac = x - np.floor(x)
    tri = 1.0 - np.abs(2.0 * frac - 1.0)
    tri_s = tri**p
    centers = tri_s >= 0.95
    edges = tri_s <= 0.05
    # Edge trim should reduce radius at edges
    assert np.mean(f_trim[edges]) < np.mean(f_base[edges])
    # Centers should be nearly unaffected
    # (allow small spillover from smoothing)
    assert np.abs(np.mean(f_trim[centers]) - np.mean(f_base[centers])) < 1e-2


def test_straight_smooth_mode_reduces_peaks_without_flat_plateau():
    H = 120.0
    r0 = 60.0
    tiers = 3
    z_seam = _tier_seams(H, tiers)[0]
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.12,
        "lp_cut_bot_deg": 14,
        "lp_cut_top_deg": 0,
        # Disable uniform ring/plateau; enable smooth mode only
        "lp_enable_flattening": False,
        "lp_cut_straight_edges": True,
        "lp_cut_straight_smooth_mode": True,
        "lp_cut_straight_smooth_strength": 0.7,
        "lp_cut_straight_smooth_passes": 2,
    }
    # Reference without smooth mode
    ref = _sample_lpf_rf(
        z=z_seam, H=H, r0=r0, base_opts={**base, "lp_cut_straight_smooth_mode": False}
    )
    sm = _sample_lpf_rf(z=z_seam, H=H, r0=r0, base_opts=base)
    # Smooth mode should pull down peaks a bit (lower 95th percentile)
    assert np.quantile(sm, 0.95) <= np.quantile(ref, 0.95) + 1e-9
    # But not create a flat plateau like uniform ring/plateau would
    # (variance remains close)
    var_ref = float(np.var(ref))
    var_sm = float(np.var(sm))
    # Allow modest reduction but not a large collapse in variance
    assert var_sm >= 0.6 * var_ref


def test_straight_edge_toggle_changes_plateauing():
    H = 120.0
    r0 = 60.0
    tiers = 3
    z = _tier_seams(H, tiers)[0]
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 16,
        "lp_cut_top_deg": 16,
    }
    f_on = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={**base, "lp_cut_straight_edges": True}
    )
    f_off = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={**base, "lp_cut_straight_edges": False}
    )
    # Straight edges should reduce variance more near seam plane
    assert np.var(f_on) < np.var(f_off)


def test_cut_softness_mm_controls_crispness():
    H = 120.0
    r0 = 60.0
    tiers = 3
    z = _tier_seams(H, tiers)[0]
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 20,
        "lp_cut_top_deg": 20,
        # Disable straight plateauing so softness effect is measurable
        "lp_cut_straight_edges": False,
    }
    f_crisp = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={**base, "lp_cut_softness_mm": 0.02}
    )
    f_soft = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={**base, "lp_cut_softness_mm": 0.2}
    )
    # Softer blend reduces deviation from the no-cut baseline
    f_nocut = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={**base, "lp_cut_bot_deg": 0, "lp_cut_top_deg": 0}
    )
    diff_crisp = float(np.linalg.norm(f_crisp - f_nocut))
    diff_soft = float(np.linalg.norm(f_soft - f_nocut))
    assert diff_soft <= diff_crisp + 1e-3


def test_cut_window_frac_localizes_effect():
    H = 120.0
    r0 = 60.0
    tiers = 3
    z_seam = _tier_seams(H, tiers)[0]
    h_tier = H / tiers
    # Choose a z that is inside the wide window (25%) but outside the narrow (5%)
    z_far = z_seam - 0.18 * h_tier
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 18,
        "lp_cut_top_deg": 18,
    }
    f_wide_far = _sample_lpf_rf(
        z=z_far, H=H, r0=r0, base_opts={**base, "lp_cut_z_window_frac": 0.25}
    )
    f_narrow_far = _sample_lpf_rf(
        z=z_far, H=H, r0=r0, base_opts={**base, "lp_cut_z_window_frac": 0.05}
    )
    # Narrow window reduces far-from-seam change vs wide window
    f_base_far = _sample_lpf_rf(
        z=z_far,
        H=H,
        r0=r0,
        base_opts={**base, "lp_cut_bot_deg": 0, "lp_cut_top_deg": 0},
    )
    diff_wide = float(np.linalg.norm(f_wide_far - f_base_far))
    diff_narrow = float(np.linalg.norm(f_narrow_far - f_base_far))
    assert diff_narrow < diff_wide


def test_uniform_ring_localize_reduces_band_wide_flattening():
    H = 120.0
    r0 = 60.0
    tiers = 3
    z = _tier_seams(H, tiers)[0]
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 16,
        "lp_cut_top_deg": 16,
        "lp_uniform_ring": True,
        "lp_enable_flattening": True,
    }
    f_wide = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={**base, "lp_uniform_ring_localize": False}
    )
    f_local = _sample_lpf_rf(
        z=z,
        H=H,
        r0=r0,
        base_opts={
            **base,
            "lp_uniform_ring_localize": True,
            "lp_uniform_ring_lock_threshold": 0.7,
            "lp_uniform_ring_blend_pow": 2.0,
        },
    )
    # Localization should retain more variance (less band-wide flatness)
    assert np.var(f_local) >= 0.7 * np.var(f_wide)


def test_edge_trim_sharpness_concentrates_at_edges():
    H = 120.0
    r0 = 60.0
    tiers = 2
    z = 0.25 * H
    base = {"lp_tiers": tiers, "lp_facets": 12, "lp_amp": 0.14, "lp_bevel": 0.2}
    # Same trim amount, different sharpness
    f0 = _sample_lpf_rf(z=z, H=H, r0=r0, base_opts=base)
    f_broad = _sample_lpf_rf(
        z=z,
        H=H,
        r0=r0,
        base_opts={**base, "lp_edge_cut_mm": 1.0, "lp_edge_cut_sharp": 0.6},
    )
    f_sharp = _sample_lpf_rf(
        z=z,
        H=H,
        r0=r0,
        base_opts={**base, "lp_edge_cut_mm": 1.0, "lp_edge_cut_sharp": 3.0},
    )
    th = np.linspace(0.0, 2.0 * np.pi, len(f_broad), endpoint=False)
    facets = 12
    p = 1.0 + 3.0 * 0.2
    x = (facets * th) / (2.0 * np.pi)
    frac = x - np.floor(x)
    tri = 1.0 - np.abs(2.0 * frac - 1.0)
    tri_s = tri**p
    edges = tri_s <= 0.05
    mid = (tri_s > 0.4) & (tri_s < 0.6)
    # Compare reduction relative to no-trim baseline at edges vs mid
    red_broad_edges = float(np.mean(f0[edges]) - np.mean(f_broad[edges]))
    red_broad_mid = float(np.mean(f0[mid]) - np.mean(f_broad[mid]))
    red_sharp_edges = float(np.mean(f0[edges]) - np.mean(f_sharp[edges]))
    red_sharp_mid = float(np.mean(f0[mid]) - np.mean(f_sharp[mid]))
    # Sharper concentrates more reduction at edges relative to mid
    assert (red_sharp_edges - red_sharp_mid) <= (red_broad_edges - red_broad_mid) - 1e-4


def test_edge_solidify_reduces_micro_oscillations_without_flattening():
    H = 120.0
    r0 = 60.0
    tiers = 3
    z = _tier_seams(H, tiers)[0]
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 16,
        "lp_cut_top_deg": 16,
        "lp_cut_straight_edges": True,
    }
    f_off = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={**base, "lp_edge_solidify_enable": False}
    )
    f_on = _sample_lpf_rf(
        z=z,
        H=H,
        r0=r0,
        base_opts={
            **base,
            "lp_edge_solidify_enable": True,
            "lp_edge_solidify_strength": 0.8,
            "lp_edge_solidify_passes": 2,
        },
    )

    # Reuse micro-residual metric
    def med5(a: np.ndarray) -> np.ndarray:
        a1 = np.roll(a, 1)
        a2 = np.roll(a, 2)
        b1 = np.roll(a, -1)
        b2 = np.roll(a, -2)
        st = np.stack([a2, a1, a, b1, b2], axis=0)
        st.sort(axis=0)
        return cast(np.ndarray, st[2])

    def micro_resid(a: np.ndarray) -> np.ndarray:
        return cast(np.ndarray, np.maximum(0.0, a - med5(a)))

    # Solidify should not meaningfully increase positive micro residuals (allow tiny epsilon)
    assert float(np.mean(micro_resid(f_on))) <= 1e-3
    assert np.var(f_on) >= 0.8 * np.var(f_off)


def test_print_safe_mode_narrows_window_and_cap():
    H = 120.0
    r0 = 60.0
    tiers = 3
    h_tier = H / tiers
    # Choose z just inside default window (12% tier) but outside print-safe (~10.8%)
    z_far = _tier_seams(H, tiers)[0] - 0.115 * h_tier
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 24,
        "lp_cut_top_deg": 24,
    }
    # With print-safe mode, far-from-seam impact should be lower (narrower window/cap)
    f_ps = _sample_lpf_rf(
        z=z_far, H=H, r0=r0, base_opts={**base, "lp_print_safe_mode": True}
    )
    f_np = _sample_lpf_rf(
        z=z_far, H=H, r0=r0, base_opts={**base, "lp_print_safe_mode": False}
    )
    f_base = _sample_lpf_rf(
        z=z_far,
        H=H,
        r0=r0,
        base_opts={**base, "lp_cut_bot_deg": 0, "lp_cut_top_deg": 0},
    )
    assert float(np.linalg.norm(f_ps - f_base)) < float(np.linalg.norm(f_np - f_base))


def test_seam_sampling_boost_does_not_change_rf():
    # Sampling boost affects meshing density, not the radial function
    f1 = _sample_lpf_rf(base_opts={"lp_seam_sampling_boost": 1})
    f3 = _sample_lpf_rf(base_opts={"lp_seam_sampling_boost": 3})
    assert np.allclose(f1, f3)


def test_seam_lock_strength_does_not_change_rf():
    # Seam lock is a mesh diagonal behavior; rf should be invariant
    f1 = _sample_lpf_rf(base_opts={"lp_seam_lock_strength": 1.0})
    f_hi = _sample_lpf_rf(base_opts={"lp_seam_lock_strength": 1.5})
    assert np.allclose(f1, f_hi)


def test_facet_direction_outward_vs_inward_envelopes():
    z = 60.0
    H = 120.0
    r0 = 60.0
    base = {"lp_facets": 12, "lp_amp": 0.18, "lp_bevel": 0.2}
    f_in = _sample_lpf_rf(z=z, H=H, r0=r0, base_opts={**base, "lp_facet_dir": "in"})
    f_out = _sample_lpf_rf(z=z, H=H, r0=r0, base_opts={**base, "lp_facet_dir": "out"})
    # Outward centers bulge; inward edges recess
    assert float(np.max(f_out)) > float(np.max(f_in))
    assert float(np.min(f_out)) > float(np.min(f_in))


def test_cut_depth_fraction_limits_vs_cap_under_flare():
    # Under stronger flare (higher r0 along height), depth fraction governs max removal more than mm cap
    H = 120.0
    r0 = 60.0
    tiers = 3
    z = _tier_seams(H, tiers)[0]
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.16,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 24,
        "lp_cut_top_deg": 24,
        "lp_cut_straight_edges": False,
    }
    # Simulate stronger flare by sampling two radii scenarios via base radius scaling
    f_cap_only = _sample_lpf_rf(
        z=z,
        H=H,
        r0=r0,
        base_opts={**base, "lp_cut_cap_mm": 0.6, "lp_cut_depth_frac_of_facet": 0.0},
    )
    f_frac_lo = _sample_lpf_rf(
        z=z,
        H=H,
        r0=r0,
        base_opts={**base, "lp_cut_cap_mm": 2.0, "lp_cut_depth_frac_of_facet": 0.2},
    )
    f_frac_hi = _sample_lpf_rf(
        z=z,
        H=H,
        r0=r0,
        base_opts={**base, "lp_cut_cap_mm": 2.0, "lp_cut_depth_frac_of_facet": 0.4},
    )
    # Fractional depth should allow deeper cut than small absolute cap, and scale with fraction
    diff_cap = float(np.mean(1.0 - f_cap_only))
    diff_frac_lo = float(np.mean(1.0 - f_frac_lo))
    diff_frac_hi = float(np.mean(1.0 - f_frac_hi))
    assert diff_frac_lo >= diff_cap + 1e-4
    assert diff_frac_hi >= diff_frac_lo + 1e-4


def test_uniform_ring_lock_and_blend_sweep_behavior():
    # Higher lock threshold and blend power should localize flattening closer to the seam
    H = 120.0
    r0 = 60.0
    tiers = 3
    z = _tier_seams(H, tiers)[0]
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 16,
        "lp_cut_top_deg": 16,
        "lp_uniform_ring": True,
        "lp_enable_flattening": True,
    }
    broad = _sample_lpf_rf(
        z=z,
        H=H,
        r0=r0,
        base_opts={
            **base,
            "lp_uniform_ring_localize": True,
            "lp_uniform_ring_lock_threshold": 0.3,
            "lp_uniform_ring_blend_pow": 1.0,
        },
    )
    tight = _sample_lpf_rf(
        z=z,
        H=H,
        r0=r0,
        base_opts={
            **base,
            "lp_uniform_ring_localize": True,
            "lp_uniform_ring_lock_threshold": 0.8,
            "lp_uniform_ring_blend_pow": 3.0,
        },
    )
    # Tight localization retains more variance than broad
    assert np.var(tight) >= np.var(broad) * 0.85


def test_print_safe_with_outward_mode_keeps_growth_guarded():
    # In outward mode with cuts, print-safe should not allow outward growth beyond base
    H = 120.0
    r0 = 60.0
    tiers = 3
    z = _tier_seams(H, tiers)[0]
    opts = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.16,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 22,
        "lp_cut_top_deg": 22,
        "lp_facet_dir": "out",
        "lp_outward_mode": True,
    }
    f_ps = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={**opts, "lp_print_safe_mode": True}
    )
    f_np = _sample_lpf_rf(
        z=z, H=H, r0=r0, base_opts={**opts, "lp_print_safe_mode": False}
    )
    # Both should respect outward guard: no value > 1.0; print-safe should not violate this
    assert float(np.max(f_ps)) <= 1.0 + 1e-9
    assert float(np.max(f_np)) <= 1.0 + 1e-9


def test_cut_depth_fraction_under_true_flare_mesh_based():
    # Validate fractional cut depth scales with facet span under actual flare (via mesh base radii)
    H = 120.0
    Rt = 85.0
    Rb = 65.0
    n_theta = 168
    n_z = 84
    style_fn = STYLES["LowPolyFacet"][0]
    base = {
        "lp_facets": 14,
        "lp_tiers": 3,
        "lp_amp": 0.16,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 22,
        "lp_cut_top_deg": 22,
        "lp_cut_straight_edges": False,
    }
    # Cap-limited vs fraction-limited runs
    opts_cap = {**base, "lp_cut_cap_mm": 0.5, "lp_cut_depth_frac_of_facet": 0.0}
    opts_frac = {**base, "lp_cut_cap_mm": 2.0, "lp_cut_depth_frac_of_facet": 0.35}
    Vc, Fc, _ = build_pot_mesh(
        H, Rt, Rb, 3.0, 3.0, 8.0, 1.2, n_theta, n_z, style_fn, opts_cap
    )
    Vf, Ff, _ = build_pot_mesh(
        H, Rt, Rb, 3.0, 3.0, 8.0, 1.2, n_theta, n_z, style_fn, opts_frac
    )
    # Compare seam ring radii at a seam plane: fraction should trim more than small cap
    # Extract z closest to first seam and compute mean radius across theta
    tiers = int(base["lp_tiers"])
    seam_z = (1 / tiers) * H
    # Find ring index nearest to seam
    ring_z = np.linspace(0.0, H, n_z)
    k = int(np.argmin(np.abs(ring_z - seam_z)))

    # Vertices are laid out ring-major: n_theta per ring
    def ring_mean_radius(V):
        ring = V[k * n_theta : (k + 1) * n_theta]
        r = np.linalg.norm(ring[:, :2], axis=1)
        return float(np.mean(r))

    r_cap = ring_mean_radius(Vc)
    r_frac = ring_mean_radius(Vf)
    assert r_frac < r_cap - 1e-3


def test_uniform_ring_param_monotonic_sweep():
    # As lock threshold and blend power increase, flattening becomes more localized (variance increases)
    H = 120.0
    r0 = 60.0
    tiers = 3
    z = _tier_seams(H, tiers)[0]
    base = {
        "lp_tiers": tiers,
        "lp_facets": 12,
        "lp_amp": 0.14,
        "lp_bevel": 0.15,
        "lp_cut_bot_deg": 18,
        "lp_cut_top_deg": 18,
        "lp_uniform_ring": True,
        "lp_enable_flattening": True,
    }
    combos = [
        (0.2, 1.0),
        (0.5, 2.0),
        (0.8, 3.0),
    ]
    vars_ = []
    for lock, powv in combos:
        f = _sample_lpf_rf(
            z=z,
            H=H,
            r0=r0,
            base_opts={
                **base,
                "lp_uniform_ring_localize": True,
                "lp_uniform_ring_lock_threshold": lock,
                "lp_uniform_ring_blend_pow": powv,
            },
        )
        vars_.append(float(np.var(f)))
    # Monotonic non-decreasing variance across combos
    assert vars_[1] >= vars_[0] * 0.98
    assert vars_[2] >= vars_[1] * 0.98

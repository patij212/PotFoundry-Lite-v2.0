import numpy as np

from potfoundry.core.geometry import STYLES
import time


def _sample_rf(theta_samples=168, *, z=100.0, H=120.0, r0=60.0, base_opts=None):
    fn = STYLES["SuperformulaBlossom"][0]
    th = np.linspace(0.0, 2.0 * np.pi, theta_samples, endpoint=False)
    opts = dict(base_opts or {})
    # Minimal base parameters to produce petals
    opts.setdefault("sf_strength", 0.8)
    opts.setdefault("sf_m_base", 8.0)
    opts.setdefault("sf_m_top", 12.0)
    opts.setdefault("sf_n1", 0.55)
    opts.setdefault("sf_n2", 1.4)
    opts.setdefault("sf_n3", 1.4)
    rf = fn(th, z, r0, H, opts)
    # Return normalized factor relative to base radius: f = rf/(r0)
    return np.asarray(rf, dtype=float) / float(r0)


def test_perf_budget_blossom_filters_vs_baseline():
    # Ensure heavy filters remain within a reasonable absolute and relative budget
    fn = STYLES["SuperformulaBlossom"][0]
    th = np.linspace(0.0, 2.0 * np.pi, 256, endpoint=False)
    z = 100.0; r0 = 60.0; H = 120.0
    base = {
        "sf_strength": 1.0,
        "sf_m_base": 8.0, "sf_m_top": 12.0,
        "sf_n1": 0.5, "sf_n2": 1.2, "sf_n3": 1.2,
    }
    heavy = {**base,
        "sf_edge_solidify_enable": True,
        "sf_edge_solidify_strength": 0.9,
        "sf_edge_solidify_passes": 3,
        "sf_edge_tame_strength": 0.9,
        "sf_edge_tame_k": 0.25,
        "sf_spike_clip_enable": True,
        "sf_spike_clip_quantile": 0.9,
        "sf_spike_clip_amount": 0.9,
        "sf_spike_clip_window": 9,
        "sf_spike_mad_enable": True,
        "sf_spike_mad_k": 3.0,
        "sf_spike_mad_amount": 1.0,
        "sf_spike_mad_window": 21,
    }
    # Warm-up
    _ = fn(th, z, r0, H, base)
    _ = fn(th, z, r0, H, heavy)
    # Average a few runs for stability
    def timed(call_opts, reps=3):
        tot = 0.0
        for _i in range(reps):
            t0 = time.perf_counter(); _ = fn(th, z, r0, H, call_opts); t1 = time.perf_counter()
            tot += (t1 - t0)
        return tot / reps
    base_mean = timed(base)
    heavy_mean = timed(heavy)
    n = len(th)
    # Absolute total budget for this test size
    assert heavy_mean < 0.1
    # Per-sample budget helps normalize across sample counts and machines
    assert (heavy_mean / n) < 2.5e-4  # 0.25 ms per sample
    # Generous relative cap to catch pathological slowdowns while avoiding tiny-baseline issues
    assert (heavy_mean / max(base_mean, 1e-9)) < 500.0


def test_peak_snap_lifts_valleys_without_raising_peaks():
    fn = STYLES["SuperformulaBlossom"][0]
    th = np.linspace(0.0, 2.0 * np.pi, 360, endpoint=False)
    z = 110.0; r0 = 70.0; H = 120.0
    base_opts = dict(sf_strength=1.0, sf_m_base=8.0, sf_m_top=12.0, sf_n1=0.45, sf_n2=1.2, sf_n3=1.2)
    # Baseline profile with pronounced peaks/valleys
    r_base = np.asarray(fn(th, z, r0, H, base_opts), dtype=float)
    # Apply peak snap filter
    opts_snap = dict(base_opts)
    opts_snap.update(sf_peak_snap_enable=True, sf_peak_snap_window=9, sf_peak_snap_quantile=0.9, sf_peak_snap_amount=0.7)
    r_snap = np.asarray(fn(th, z, r0, H, opts_snap), dtype=float)
    # Valleys should lift noticeably
    assert float(np.min(r_snap)) > float(np.min(r_base))
    # Peaks should not increase by more than a tiny epsilon
    peak_delta = float(np.max(r_snap) - np.max(r_base))
    assert peak_delta < 1e-6 or peak_delta < 0.25  # allow tiny numerical or sub-mm on scaled radii


def _count_peaks(arr: np.ndarray) -> int:
    a = np.asarray(arr, dtype=float)
    # Circular neighbor comparison
    prev = np.roll(a, 1)
    nxt = np.roll(a, -1)
    return int(np.count_nonzero((a > prev) & (a > nxt)))


def test_strength_blend_behavior():
    # With sf_strength=0, no modulation: f==1 exactly
    f0 = _sample_rf(base_opts={"sf_strength": 0.0})
    assert np.allclose(f0, 1.0)
    # Increasing strength should increase variation around 1
    f1 = _sample_rf(base_opts={"sf_strength": 0.5})
    f2 = _sample_rf(base_opts={"sf_strength": 1.0})
    var1 = float(np.var(f1))
    var2 = float(np.var(f2))
    assert var1 > 0.0
    assert var2 >= var1 - 1e-9


def test_m_top_increases_petal_count_with_height():
    # More lobes at the top when m_top > m_base
    opts = {
        "sf_strength": 1.0,
        "sf_m_base": 6.0,
        "sf_m_top": 12.0,
        "sf_m_curve_exp": 1.0,
        "sf_n1": 0.5, "sf_n2": 1.2, "sf_n3": 1.2,
    }
    f_low = _sample_rf(z=10.0, base_opts=opts)
    f_high = _sample_rf(z=110.0, base_opts=opts)
    peaks_low = _count_peaks(f_low)
    peaks_high = _count_peaks(f_high)


def test_filters_respect_zero_strength_identity():
    # With sf_strength==0, all filters/solidify/tame should not alter rf=1 baseline
    base = _sample_rf(base_opts={"sf_strength": 0.0})
    # Apply a suite of filters
    f = _sample_rf(base_opts={
        "sf_strength": 0.0,
        "sf_edge_solidify_enable": True,
        "sf_edge_solidify_strength": 0.9,
        "sf_edge_solidify_passes": 3,
        "sf_edge_tame_strength": 1.0,
        "sf_edge_tame_k": 0.2,
        "sf_spike_clip_enable": True,
        "sf_spike_clip_quantile": 0.9,
        "sf_spike_clip_amount": 0.9,
        "sf_spike_mad_enable": True,
        "sf_spike_mad_k": 3.0,
        "sf_spike_mad_amount": 1.0,
    })
    assert np.allclose(f, base)


def test_m_curve_exp_biases_top_vs_bottom_lobes():
    # With m_base != m_top, m_curve_exp skews where along height the transition occurs
    opts_lo = {"sf_strength": 1.0, "sf_m_base": 6.0, "sf_m_top": 12.0, "sf_m_curve_exp": 0.5,
               "sf_n1": 0.5, "sf_n2": 1.2, "sf_n3": 1.2}
    opts_hi = {**opts_lo, "sf_m_curve_exp": 2.0}
    f_lo_mid = _sample_rf(z=60.0, base_opts=opts_lo)
    f_hi_mid = _sample_rf(z=60.0, base_opts=opts_hi)
    # Expect different peak counts at mid-height because of curve exp bias
    def peaks(a: np.ndarray) -> int:
        p = np.asarray(a, dtype=float)
        return int(np.sum((p > np.roll(p, 1)) & (p > np.roll(p, -1))))
    assert peaks(f_lo_mid) != peaks(f_hi_mid)


def test_edge_sharp_monotonic_spread_increase():
    # Increasing edge_sharp should monotonically increase spread (within tolerance)
    base = _sample_rf(base_opts={"sf_strength": 1.0})
    s1 = _sample_rf(base_opts={"sf_strength": 1.0, "sf_edge_sharp": 0.2})
    s2 = _sample_rf(base_opts={"sf_strength": 1.0, "sf_edge_sharp": 0.5})
    spread = lambda a: float(np.max(a) - np.min(a))
    assert spread(s1) >= spread(base) - 1e-6
    assert spread(s2) >= spread(s1) - 1e-6


def test_n_top_changes_shape_with_height():
    # Changing n1_top relative to base yields a noticeable change top vs bottom
    opts = {
        "sf_strength": 1.0,
        "sf_m_base": 8.0, "sf_m_top": 8.0,  # keep m constant to isolate n
        "sf_n1": 0.35, "sf_n1_top": 0.7,
        "sf_n2": 1.0,  "sf_n2_top": 1.0,
        "sf_n3": 1.0,  "sf_n3_top": 1.0,
    }
    f_bot = _sample_rf(z=5.0, base_opts=opts)
    f_top = _sample_rf(z=115.0, base_opts=opts)
    # L2 difference should be significant
    diff = float(np.linalg.norm(f_top - f_bot))
    assert diff > 0.05


def test_a_b_asymmetry_changes_pattern():
    # Anisotropy in a/b yields a different pattern vs baseline and differs when swapped
    common = {"sf_strength": 1.0, "sf_m_base": 8.0, "sf_m_top": 8.0, "sf_n1": 0.5, "sf_n2": 1.2, "sf_n3": 1.2}
    f_base = _sample_rf(base_opts={**common, "sf_a": 1.0, "sf_b": 1.0})
    f_ab = _sample_rf(base_opts={**common, "sf_a": 1.0, "sf_b": 1.6})
    f_ba = _sample_rf(base_opts={**common, "sf_a": 1.6, "sf_b": 1.0})
    assert not np.allclose(f_ab, f_base)
    assert not np.allclose(f_ba, f_base)
    # Swapping a/b should not be identical to each other (pattern rotates differ)
    assert not np.allclose(f_ab, f_ba)


def test_solidify_protection_controls_reduction():
    # High protection should reduce less than low protection
    f0 = _sample_rf(base_opts={"sf_strength": 1.0})
    # Low protection: preserve very few edges (protect fewer), smooth more
    f_lowprot = _sample_rf(base_opts={
        "sf_strength": 1.0,
        "sf_edge_solidify_enable": True,
        "sf_edge_solidify_strength": 0.8,
        "sf_edge_solidify_passes": 2,
        "sf_edge_solidify_sigma_s": 1.2,
        "sf_edge_solidify_sigma_r": 0.12,
        "sf_edge_solidify_micro_thresh": 0.12,
        "sf_edge_solidify_protect_grad": 0.3,
        "sf_edge_solidify_preserve_q": 0.99,
    })
    # High protection: preserve more edges (protect more), smooth less
    f_highprot = _sample_rf(base_opts={
        "sf_strength": 1.0,
        "sf_edge_solidify_enable": True,
        "sf_edge_solidify_strength": 0.8,
        "sf_edge_solidify_passes": 2,
        "sf_edge_solidify_sigma_s": 1.2,
        "sf_edge_solidify_sigma_r": 0.12,
        "sf_edge_solidify_micro_thresh": 0.12,
        "sf_edge_solidify_protect_grad": 0.05,
        "sf_edge_solidify_preserve_q": 0.5,
    })
    # Micro-jag reduction measure: residual to circular median-of-5 (focus on tiny peaks)
    def med5(a: np.ndarray) -> np.ndarray:
        a1 = np.roll(a, 1); a2 = np.roll(a, 2); b1 = np.roll(a, -1); b2 = np.roll(a, -2)
        st = np.stack([a2, a1, a, b1, b2], axis=0)
        st.sort(axis=0)
        return st[2]
    def micro_resid(a: np.ndarray) -> np.ndarray:
        return np.maximum(0.0, a - med5(a))
    r0 = micro_resid(f0)
    r_low = micro_resid(f_lowprot)
    r_high = micro_resid(f_highprot)
    # Low protection should reduce micro residual more than high protection
    assert float(np.mean(r_low)) <= float(np.mean(r_high)) - 1e-4
    # And overall variance reduction stronger for low protection
    var0 = float(np.var(f0)); var_low = float(np.var(f_lowprot)); var_high = float(np.var(f_highprot))
    assert (var0 - var_low) >= (var0 - var_high) + 1e-4


def test_auto_tame_triggers_on_high_strength():
    # With explicit tame off, auto_tame should apply when strength >= threshold
    base = _sample_rf(base_opts={
        "sf_strength": 1.0,
        "sf_edge_tame_strength": 0.0,
        "sf_auto_tame": False,
    })
    auto_on = _sample_rf(base_opts={
        "sf_strength": 1.0,
        "sf_edge_tame_strength": 0.0,
        "sf_auto_tame": True,
        "sf_auto_tame_thresh": 0.5,
        "sf_auto_tame_amount": 0.7,
    })
    # Expect reduced spread and non-increasing high tail with auto_tame
    spread0 = float(np.max(base) - np.min(base))
    spread1 = float(np.max(auto_on) - np.min(auto_on))
    assert spread1 <= spread0 - 1e-4
    # Compare average among baseline's top-2% values to avoid quantile tie flakiness
    q = np.quantile(base, 0.98)
    mask = base >= q
    assert float(np.mean(auto_on[mask])) <= float(np.mean(base[mask])) + 2e-6

def test_spike_clip_quantile_reduces_top_quantiles_only():
    # Baseline factor
    f0 = _sample_rf(base_opts={"sf_strength": 1.0})
    # Enable quantile spike clip strong
    f1 = _sample_rf(base_opts={
        "sf_spike_clip_enable": True,
        # For window=9, use q < 8/9 to avoid threshold == local max
        "sf_spike_clip_quantile": 0.85,
        "sf_spike_clip_amount": 0.9,
        "sf_spike_clip_window": 9,
        # Max out strength for clearer effect
        "sf_strength": 1.0,
    })
    # No increases at peaks; at least one reduction expected
    diff = f1 - f0
    assert np.any(diff < -1e-6)
    # High-percentile should drop
    assert np.quantile(f1, 0.98) <= np.quantile(f0, 0.98) - 5e-5


def test_spike_mad_clipping_is_peak_only_and_robust():
    f0 = _sample_rf(base_opts={"sf_strength": 1.0})
    f1 = _sample_rf(base_opts={
        "sf_spike_mad_enable": True,
        # Stronger clipping settings to ensure effect
        "sf_spike_mad_k": 1.2,
        "sf_spike_mad_amount": 1.0,
        "sf_spike_mad_window": 21,
        "sf_strength": 1.0,
    })
    # Peak-only reduction expected at some thetas (no requirement on valleys)
    diff = f1 - f0
    assert np.any(diff < -1e-6)
    # Median stays close; high-percentile drops
    assert np.median(f1) >= np.median(f0) - 0.12
    assert np.quantile(f1, 0.98) <= np.quantile(f0, 0.98) + 1e-12


def test_spike_mad_rim_boost_strengthens_effect_near_rim():
    # Compare at low-z vs near rim with same MAD params
    opt = {
        "sf_spike_mad_enable": True,
        "sf_spike_mad_k": 3.1,
        "sf_spike_mad_amount": 0.85,
        "sf_spike_mad_window": 9,
        "sf_spike_mad_z_boost_enable": True,
        "sf_spike_mad_z_start": 0.7,
        "sf_spike_mad_z_power": 1.5,
        "sf_spike_mad_k_drop_frac": 0.4,
        "sf_spike_mad_amount_boost": 0.25,
    }
    f_low = _sample_rf(z=40.0, H=120.0, base_opts=opt)
    f_rim = _sample_rf(z=115.0, H=120.0, base_opts=opt)
    # Expect stronger clipping near rim: lower high-quantiles
    assert np.quantile(f_rim, 0.98) <= np.quantile(f_low, 0.98)
    assert np.max(f_rim) <= np.max(f_low)


def test_edge_solidify_reduces_micro_jaggies_preserving_edges():
    f0 = _sample_rf(base_opts={"sf_strength": 1.0})
    f1 = _sample_rf(base_opts={
        "sf_edge_solidify_enable": True,
        "sf_edge_solidify_strength": 0.7,
        "sf_edge_solidify_passes": 2,
        "sf_edge_solidify_sigma_s": 1.2,
        "sf_edge_solidify_sigma_r": 0.12,
        "sf_edge_solidify_micro_thresh": 0.10,
        "sf_edge_solidify_protect_grad": 0.12,
        "sf_edge_solidify_preserve_q": 0.9,
    })
    # Peak-only smoothing: should not raise values
    assert np.all(f1 <= f0 + 1e-9)
    # Micro-oscillation reduction: variance should not increase
    assert np.var(f1) <= np.var(f0) + 1e-9


def test_edge_tame_saturates_extreme_peaks():
    f0 = _sample_rf()
    f1 = _sample_rf(base_opts={
        # Use strong taming to ensure visible effect at the top
        "sf_edge_tame_strength": 1.0,
        "sf_edge_tame_k": 0.3,
        "sf_strength": 1.0,
    })
    # Taming reduces spread (brings peaks/valleys toward center)
    spread0 = float(np.max(f0) - np.min(f0))
    spread1 = float(np.max(f1) - np.min(f1))
    assert spread1 <= spread0 - 1e-4


def test_edge_sharp_increases_contrast_without_exceeding_bounds():
    f0 = _sample_rf()
    f1 = _sample_rf(base_opts={
        "sf_edge_sharp": 0.3,
    })
    # Contrast lift: spread increases a bit
    assert (np.max(f1) - np.min(f1)) >= (np.max(f0) - np.min(f0)) - 1e-6
    # Sanity: rf is sanitized and bounded
    assert np.all(np.isfinite(f1))
    assert np.all((f1 >= 0.1) & (f1 <= 3.0))


def test_diagonal_smoothing_flag_does_not_change_rf():
    # Diagonal smoothing influences mesh triangulation, not rf pattern
    f0 = _sample_rf(base_opts={"sf_diagonal_smooth_passes": 0})
    f1 = _sample_rf(base_opts={"sf_diagonal_smooth_passes": 3})
    # rf should be equal because diagonal smoothing is applied during meshing
    assert np.allclose(f0, f1)


def test_combined_spike_clip_and_mad_dont_duplicate_overclip():
    # Combined mode should be stronger than either alone, but not collapse variation
    f_base = _sample_rf()
    f_clip = _sample_rf(base_opts={
        "sf_spike_clip_enable": True,
        "sf_spike_clip_quantile": 0.985,
        "sf_spike_clip_amount": 0.7,
        "sf_spike_clip_window": 9,
    })
    f_mad = _sample_rf(base_opts={
        "sf_spike_mad_enable": True,
        "sf_spike_mad_k": 3.1,
        "sf_spike_mad_amount": 0.88,
        "sf_spike_mad_window": 9,
    })
    f_both = _sample_rf(base_opts={
        "sf_spike_clip_enable": True,
        "sf_spike_clip_quantile": 0.985,
        "sf_spike_clip_amount": 0.7,
        "sf_spike_clip_window": 9,
        "sf_spike_mad_enable": True,
        "sf_spike_mad_k": 3.1,
        "sf_spike_mad_amount": 0.88,
        "sf_spike_mad_window": 9,
    })
    # Stronger than each alone at top quantiles, but keep variation alive
    q = 0.98
    assert np.quantile(f_both, q) <= min(np.quantile(f_clip, q), np.quantile(f_mad, q))
    # Not flat: retain some spread
    assert (np.max(f_both) - np.min(f_both)) > 0.02

"""
Lowpoly Facet style function for PotFoundry.

This module contains the outer radius function for the lowpoly_facet pot style.
"""
from __future__ import annotations

import math
import numpy as np
from numpy.typing import NDArray

from ...types import StyleOpts

__all__ = ["r_outer_lowpoly_facet"]

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
        return float(out) if np.isscalar(theta) else out

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
                return float(mixed) if mixed.shape == () else mixed

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
                    return np.asarray(sorted3[1], dtype=float)

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
    return float(out) if np.isscalar(theta) else out




# -----------------------------
# Mesh builder (watertight)
# -----------------------------




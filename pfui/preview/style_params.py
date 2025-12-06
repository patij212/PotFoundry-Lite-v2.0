"""Helpers to pack style parameter payloads for the WebGPU preview."""
from __future__ import annotations

import math
from collections.abc import Iterable, Sequence

STYLE_PARAM_CAPACITY = 48
STYLE_ID_MAP = {
    "SuperformulaBlossom": 0,
    "FourierBloom": 1,
    "SpiralRidges": 2,
    "SuperellipseMorph": 3,
    "HarmonicRipple": 4,
}

_DEG2RAD = math.pi / 180.0


def _clamp(values: Iterable[float]) -> list[float]:
    out: list[float] = []
    for value in values:
        try:
            out.append(float(value))
        except Exception:
            out.append(0.0)
    return out


def _pad(values: Sequence[float]) -> list[float]:
    buf = list(values)
    if len(buf) < STYLE_PARAM_CAPACITY:
        buf.extend([0.0] * (STYLE_PARAM_CAPACITY - len(buf)))
    else:
        buf = buf[:STYLE_PARAM_CAPACITY]
    return buf


def _pack_superformula(opts: dict[str, float]) -> list[float]:
    return _pad(
        _clamp(
            (
                opts.get("sf_m_base", 6.0),
                opts.get("sf_m_top", 10.0),
                opts.get("sf_m_curve_exp", 1.2),
                opts.get("sf_n1", 0.35),
                opts.get("sf_n1_top", 0.50),
                opts.get("sf_n2", 0.8),
                opts.get("sf_n2_top", 1.4),
                opts.get("sf_n3", 0.8),
                opts.get("sf_n3_top", 0.8),
                opts.get("sf_a", 1.0),
                opts.get("sf_b", 1.0),
            ),
        ),
    )


def _pack_fourier(opts: dict[str, float]) -> list[float]:
    return _pad(
        _clamp(
            (
                opts.get("fb_base_cos8_amp", 0.12),
                opts.get("fb_base_cos8_phase", 0.0),
                opts.get("fb_base_sin4_amp", 0.05),
                opts.get("fb_base_sin4_phase", 0.6),
                opts.get("fb_base_cos12_amp", -0.04),
                opts.get("fb_base_cos12_phase", 1.3),
                opts.get("fb_top_cos11_amp", 0.18),
                opts.get("fb_top_cos11_phase", 0.5),
                opts.get("fb_top_sin7_amp", -0.07),
                opts.get("fb_top_sin7_phase", 0.0),
                opts.get("fb_top_cos22_amp", 0.05),
                opts.get("fb_top_cos22_phase", 0.9),
                opts.get("fb_wobble_amp", 0.06),
                opts.get("fb_wobble_freq", 5.0),
                opts.get("fb_wobble_zgain", 0.5),
                opts.get("fb_strength", 1.0),
            ),
        ),
    )


def _pack_spiral(opts: dict[str, float]) -> list[float]:
    return _pad(
        _clamp(
            (
                opts.get("spiral_k", 9),
                opts.get("spiral_turns", 1.15),
                opts.get("spiral_amp_min", 0.15),
                opts.get("spiral_amp_max", 0.25),
                opts.get("spiral_amp_curve", 1.3),
                opts.get("spiral_groove_amp", 0.04),
                opts.get("spiral_groove_mult", 3.0),
                opts.get("spiral_phase_mult", 1.7),
            ),
        ),
    )


def _pack_superellipse(opts: dict[str, float]) -> list[float]:
    return _pad(
        _clamp(
            (
                opts.get("se_m_base", 2.0),
                opts.get("se_m_top", 5.5),
                opts.get("se_m_curve_exp", 1.1),
                opts.get("se_c4_amp", 0.08),
                float(opts.get("se_c4_phase_deg", 23)) * _DEG2RAD,
                opts.get("se_c8_amp", 0.03),
                float(opts.get("se_c8_phase_deg", 0)) * _DEG2RAD,
            ),
        ),
    )


def _pack_harmonic(opts: dict[str, float]) -> list[float]:
    return _pad(
        _clamp(
            (
                opts.get("hr_petals", 7),
                opts.get("hr_petal_amp", 0.16),
                float(opts.get("hr_petal_phase_deg", 17)) * _DEG2RAD,
                opts.get("hr_petal_zgain", 0.6),
                opts.get("hr_ripple_freq", 31),
                opts.get("hr_ripple_amp", 0.03),
                float(opts.get("hr_ripple_phase_deg", 0)) * _DEG2RAD,
                opts.get("hr_ripple_zgain", 1.0),
                opts.get("hr_bell", 0.05),
            ),
        ),
    )


_PACKERS = {
    0: _pack_superformula,
    1: _pack_fourier,
    2: _pack_spiral,
    3: _pack_superellipse,
    4: _pack_harmonic,
}


def build_style_param_payload(style_name: str, opts: dict[str, float] | None) -> tuple[int, list[float]]:
    """Return ``(style_id, param_block)`` for the given style.

    Args:
        style_name: Name in ``potfoundry.geometry.STYLES``.
        opts: Style-specific options dict.

    Returns:
        style_id: Stable numeric identifier for shaders.
        param_block: Fixed-length list (``STYLE_PARAM_CAPACITY``) of floats.

    """
    style_id = STYLE_ID_MAP.get(style_name, 0)
    packer = _PACKERS.get(style_id, _pack_superformula)
    values = packer(opts or {})
    if values:
        values[-1] = float(style_id + 1)
    return style_id, values


__all__ = [
    "STYLE_ID_MAP",
    "STYLE_PARAM_CAPACITY",
    "build_style_param_payload",
]

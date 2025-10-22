from __future__ import annotations
from dataclasses import dataclass
from typing import List, Dict, Any


@dataclass
class HealthBadge:
    label: str
    status: str  # "ok" | "warn"
    tip: str


def _health_badge(dg, label: str, status: str, tip: str) -> None:
    if status == "ok":
        dg.success(f"{label}: OK")
    else:
        dg.error(f"{label}: Check")
    dg.caption(tip)


def _design_health(
    H: float, Rt: float, Rb: float, t_wall: float, t_bottom: float, r_drain: float
) -> List[HealthBadge]:
    badges: List[HealthBadge] = []
    minR = min(Rt, Rb)
    wall_ratio = t_wall / max(1.0, minR)
    if wall_ratio < 0.01:
        badges.append(
            HealthBadge("Wall ratio", "warn", "Walls <1% of radius may be fragile.")
        )
    elif wall_ratio > 0.15:
        badges.append(
            HealthBadge(
                "Wall ratio",
                "warn",
                "Very thick walls reduce volume; may self-intersect.",
            )
        )
    else:
        badges.append(HealthBadge("Wall ratio", "ok", "Looks reasonable for FDM/FFF."))

    if r_drain < max(4.0, 0.8 * t_wall):
        badges.append(
            HealthBadge(
                "Drain", "warn", "Consider larger drain vs wall for reliable flow."
            )
        )
    else:
        badges.append(HealthBadge("Drain", "ok", "Drain to wall ratio OK."))

    if t_bottom > 0.3 * H:
        badges.append(
            HealthBadge(
                "Bottom thickness", "warn", "Bottom >30% of height – likely excessive."
            )
        )
    else:
        badges.append(
            HealthBadge("Bottom thickness", "ok", "Bottom thickness proportion OK.")
        )

    return badges


# ---- Inline validation with suggestions --------------------------------------


@dataclass
class ValidationIssue:
    field: str  # which control this primarily concerns (e.g., "r_drain")
    level: str  # "info" | "warn" | "error"
    message: str  # user-facing text
    suggestion: Dict[str, Any] | None = None  # optional dict of session_state updates


def validate_dimensions(
    H: float,
    top_od: float,
    bottom_od: float,
    t_wall: float,
    t_bottom: float,
    r_drain: float,
) -> List[ValidationIssue]:
    """Validate high-level dimension inputs and propose fixes.

    Returns a list of ValidationIssue with optional suggestion dicts that can
    be queued into session state to auto-fix common problems.
    """
    issues: List[ValidationIssue] = []

    # Derived radii
    Rt = 0.5 * float(top_od)
    Rb = 0.5 * float(bottom_od)
    minR = float(min(Rt, Rb))

    # 1) Drain hole too small compared to wall
    min_drain = max(4.0, 0.8 * float(t_wall))
    if float(r_drain) < min_drain:
        sug = {"r_drain": round(min_drain, 1)}
        issues.append(
            ValidationIssue(
                field="r_drain",
                level="warn",
                message=f"Drain radius is small vs wall; consider at least {min_drain:.1f} mm.",
                suggestion=sug,
            )
        )

    # 2) Wall thickness too large relative to diameter
    if float(t_wall) > 0.12 * min(float(top_od), float(bottom_od)):
        target = round(0.10 * min(float(top_od), float(bottom_od)), 1)
        issues.append(
            ValidationIssue(
                field="t_wall",
                level="warn",
                message="Wall thickness is very large vs diameter; may self-intersect.",
                suggestion={"t_wall": max(1.5, target)},
            )
        )

    # 3) Bottom slab too thick
    if float(t_bottom) > 0.3 * float(H):
        sug_val = round(0.2 * float(H), 1)
        issues.append(
            ValidationIssue(
                field="t_bottom",
                level="warn",
                message="Bottom thickness >30% of height; consider reducing.",
                suggestion={"t_bottom": max(2.0, sug_val)},
            )
        )

    # 4) Wall thickness approaches/exceeds radius
    if minR <= float(t_wall) * 1.2:
        # Prefer reducing wall slightly if diameters seem fixed; otherwise bump bottom_od
        sug = {"t_wall": max(1.5, round(0.6 * minR, 1))}
        # If still tight, increase both ODs by 10%
        if sug["t_wall"] * 1.2 >= minR:
            sug = {
                "top_od": round(float(top_od) * 1.1, 1),
                "bottom_od": round(float(bottom_od) * 1.1, 1),
            }
        issues.append(
            ValidationIssue(
                field="t_wall",
                level="error",
                message="Wall thickness approaches/exceeds radius; increase diameters or reduce wall.",
                suggestion=sug,
            )
        )

    # 5) Very thin walls
    if float(t_wall) < 1.5:
        issues.append(
            ValidationIssue(
                field="t_wall",
                level="info",
                message="Very thin walls (<1.5 mm) may be fragile in printing.",
                suggestion={"t_wall": 1.8},
            )
        )

    return issues

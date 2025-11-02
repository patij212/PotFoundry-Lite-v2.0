from __future__ import annotations
from dataclasses import dataclass
from typing import List

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

def _design_health(H: float, Rt: float, Rb: float, t_wall: float, t_bottom: float, r_drain: float) -> List[HealthBadge]:
    badges: List[HealthBadge] = []
    minR = min(Rt, Rb)
    wall_ratio = t_wall / max(1.0, minR)
    if wall_ratio < 0.01:
        badges.append(HealthBadge("Wall ratio", "warn", "Walls <1% of radius may be fragile."))
    elif wall_ratio > 0.15:
        badges.append(HealthBadge("Wall ratio", "warn", "Very thick walls reduce volume; may self-intersect."))
    else:
        badges.append(HealthBadge("Wall ratio", "ok", "Looks reasonable for FDM/FFF."))

    if r_drain < max(4.0, 0.8 * t_wall):
        badges.append(HealthBadge("Drain", "warn", "Consider larger drain vs wall for reliable flow."))
    else:
        badges.append(HealthBadge("Drain", "ok", "Drain to wall ratio OK."))

    if t_bottom > 0.3 * H:
        badges.append(HealthBadge("Bottom thickness", "warn", "Bottom >30% of height – likely excessive."))
    else:
        badges.append(HealthBadge("Bottom thickness", "ok", "Bottom thickness proportion OK."))

    return badges

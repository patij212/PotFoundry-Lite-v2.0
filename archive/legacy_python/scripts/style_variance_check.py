"""Style variance diagnostic.

Runs a quick mesh build for each registered style with two different
option sets and reports whether the geometry meaningfully changes.

Outputs a concise table to stdout and writes a JSON report to
tools/style_variance_report.json for later inspection.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from potfoundry import STYLES, build_pot_mesh


def mesh_signature(verts: np.ndarray) -> dict[str, float]:
    if verts.size == 0:
        return {"r_mean": 0.0, "r_std": 0.0, "z_mean": 0.0}
    r = np.sqrt(verts[:, 0] ** 2 + verts[:, 1] ** 2)
    return {
        "r_mean": float(np.mean(r)),
        "r_std": float(np.std(r)),
        "z_mean": float(np.mean(verts[:, 2])),
    }


def diff_metric(v0: np.ndarray, v1: np.ndarray) -> dict[str, float]:
    # Allow different triangulations by comparing per-vertex radial distributions
    r0 = np.sqrt(v0[:, 0] ** 2 + v0[:, 1] ** 2)
    r1 = np.sqrt(v1[:, 0] ** 2 + v1[:, 1] ** 2)
    n = min(r0.size, r1.size)
    if n == 0:
        return {"radial_l2": 0.0, "radial_linf": 0.0}
    # Compare first n entries as a rough indicator (meshes share ring structure)
    d = np.abs(r0[:n] - r1[:n])
    return {"radial_l2": float(np.sqrt(np.sum(d**2) / n)), "radial_linf": float(np.max(d))}


def style_variants(style: str) -> tuple[dict[str, Any], dict[str, Any]]:
    # Minimal, legacy-keyed variants per style
    if style == "HarmonicRipple":
        return ({"hr_petals": 6}, {"hr_petals": 14})
    if style == "SpiralRidges":
        return ({"spiral_k": 7}, {"spiral_k": 15})
    if style == "SuperellipseMorph":
        return ({"se_m_top": 2.0}, {"se_m_top": 6.0})
    if style == "SuperformulaBlossom":
        return ({"sf_strength": 0.0}, {"sf_strength": 0.9, "sf_edge_flow_reconstruct_enable": False})
    if style == "FourierBloom":
        return ({"fb_strength": 0.2}, {"fb_strength": 1.6})
    if style == "LowPolyFacet":
        return ({"lp_facets": 8, "lp_amp": 0.08}, {"lp_facets": 24, "lp_amp": 0.22})
    return ({}, {"twist": 0.25})


def run_once(style: str) -> dict[str, Any]:
    fn = STYLES[style][0]
    base = {
        "H": 120.0,
        "Rt": 70.0,
        "Rb": 45.0,
        "t_wall": 3.0,
        "t_bottom": 3.0,
        "r_drain": 8.0,
        "expn": 1.1,
        "n_theta": 96,
        "n_z": 48,
    }
    opts0, opts1 = style_variants(style)
    V0, F0, _ = build_pot_mesh(r_outer_fn=fn, style_opts=opts0, **base)
    V1, F1, _ = build_pot_mesh(r_outer_fn=fn, style_opts=opts1, **base)
    V0 = np.asarray(V0, dtype=float)
    V1 = np.asarray(V1, dtype=float)
    s0 = mesh_signature(V0)
    s1 = mesh_signature(V1)
    d = diff_metric(V0, V1)
    changed = (d["radial_l2"] > 1e-3) or (d["radial_linf"] > 1e-3)
    return {
        "style": style,
        "variant0": opts0,
        "variant1": opts1,
        "sig0": s0,
        "sig1": s1,
        "diff": d,
        "changed": bool(changed),
        "verts0": len(V0),
        "verts1": len(V1),
        "faces0": len(F0),
        "faces1": len(F1),
    }


def main() -> int:
    results = []
    failures = []
    for style in STYLES.keys():
        try:
            res = run_once(style)
            results.append(res)
            mark = "✓" if res["changed"] else "✗"
            print(f"{mark} {style:<22} ΔL2={res['diff']['radial_l2']:.4f} ΔL∞={res['diff']['radial_linf']:.4f}")
            if not res["changed"]:
                failures.append(style)
        except Exception as e:
            print(f"! {style:<22} error: {e}")
            failures.append(style)

    outpath = Path("tools/style_variance_report.json")
    outpath.parent.mkdir(parents=True, exist_ok=True)
    outpath.write_text(json.dumps({"results": results}, indent=2))
    if failures:
        print("\nStyles with no detectable variance:", ", ".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

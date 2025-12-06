import json
import os


def find_detailed_row(
    path,
    require_keys=(
        "R_analysis_sample",
        "Env_sample",
        "Env_to_use_sample",
        "origin_map_sample",
    ),
):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            rows = obj.get("rows", [])
            for r in rows:
                if not isinstance(r, dict):
                    continue
                if all(k in r for k in require_keys):
                    return r
    return None


def test_argmin_alignment_bridge_vs_analysis_min():
    p = os.path.join(
        os.path.dirname(__file__), "..", "tools", "edgeflow_verbose_diagnostics.jsonl",
    )
    p = os.path.normpath(p)
    row = find_detailed_row(p)
    assert (
        row is not None
    ), f"No detailed diagnostic row found in {p} with required keys"

    R_analysis = row["R_analysis_sample"]
    Env = row["Env_sample"]
    Env_to_use = row["Env_to_use_sample"]
    origin_map = row["origin_map_sample"]

    # compute discrete bridge (where Env_to_use raised above Env)
    bridge = [(u - v) for u, v in zip(Env_to_use, Env)]

    # find discrete argmin of bridge and of analysis radii
    argmin_bridge = min(range(len(bridge)), key=lambda i: bridge[i])
    argmin_analysis = min(range(len(R_analysis)), key=lambda i: R_analysis[i])

    # Map indices into origin-group (sector) space using origin_map. If origin_map is not usable,
    # fall back to raw indices.
    try:
        mapped_bridge = origin_map[argmin_bridge]
        mapped_analysis = origin_map[argmin_analysis]
    except Exception:
        mapped_bridge = argmin_bridge
        mapped_analysis = argmin_analysis

    # Build ordered unique origins and compute sector indices for a higher-level comparison.
    unique_origins = sorted(list(dict.fromkeys(origin_map))) if origin_map else None
    if unique_origins:
        sec_bridge = (
            unique_origins.index(mapped_bridge)
            if mapped_bridge in unique_origins
            else None
        )
        sec_analysis = (
            unique_origins.index(mapped_analysis)
            if mapped_analysis in unique_origins
            else None
        )
    else:
        sec_bridge = mapped_bridge
        sec_analysis = mapped_analysis

    # Allow a small permissive tolerance in sector-space. Empirically ±2 sectors is acceptable
    # for the discrete-to-continuous alignment heuristics used here.
    max_allowed_sector_delta = 2
    if sec_bridge is None or sec_analysis is None:
        delta = abs(mapped_bridge - mapped_analysis)
    else:
        delta = abs(sec_bridge - sec_analysis)

    assert delta <= max_allowed_sector_delta, (
        f"Bridge argmin (sector {sec_bridge} mapped->{mapped_bridge}) not aligned with analysis argmin (sector {sec_analysis} mapped->{mapped_analysis}), delta={delta}.\n"
        f"Bridge argmin index={argmin_bridge}, analysis argmin index={argmin_analysis}\n"
        f"min_bridge_value={bridge[argmin_bridge]}, min_R_analysis={R_analysis[argmin_analysis]}"
    )

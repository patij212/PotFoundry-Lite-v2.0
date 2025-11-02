import importlib
import json
import os
import sys
from pathlib import Path


def main() -> None:
    # Ensure repository root is on sys.path for local imports
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)

    # Lazy import the heavy geometry module to avoid importing it at module
    # import time (keeps focused mypy runs small and fast).
    geom_mod = importlib.import_module("potfoundry" + ".core.geometry")
    build_pot_mesh = getattr(geom_mod, "build_pot_mesh")
    # Import presets dynamically to avoid static analysis importing pfui.
    PRESETS = importlib.import_module("pfui" + ".presets").PRESETS

    # Parameters must match reproduce runs
    H = 120.0
    n_z = 84
    n_theta = 168
    r_drain = 10.0

    # Read compare file
    compare_path = Path(repo_root) / "tools" / "edgeflow_compare.json"
    if not compare_path.exists():
        print("compare file not found:", compare_path)
        sys.exit(1)

    with open(compare_path, "r", encoding="utf-8") as fh:
        comp = json.load(fh)

    # min_on is list of [z, min]
    min_on = comp.get("min_on", [])
    # select z where min <= r_drain + 1.0 (allow slight float tolerance)
    threshold = r_drain + 1.0 + 1e-8
    suspicious = [float(z) for z, v in min_on if float(v) <= threshold]
    print("found suspicious z rows count=", len(suspicious))

    # compute zi index from z: zi = round(z / (H/(n_z-1)))
    dz = H / float(max(1, n_z - 1))
    zi_list = []
    for z in suspicious:
        zi = int(round(z / dz))
        zi = max(0, min(n_z - 1, zi))
        zi_list.append(zi)
    # dedupe and sort
    zi_list = sorted(set(zi_list))
    print("derived zi indices:", zi_list)

    # Runner: for each zi, call build_pot_mesh with probe enabled
    p = PRESETS["SuperformulaBlossom"]["Crisp Petals (De-Jag)"]
    base_style = dict(p)
    base_style["sf_edge_flow_reconstruct_enable"] = True
    base_style["sf_edge_flow_mode"] = "ridge_paths"
    base_style["sf_edge_flow_debug"] = True
    base_style["sf_edge_flow_verbose_diagnostics"] = True

    out_lines = []
    for zi in zi_list:
        style_opts = dict(base_style)
        style_opts["sf_edge_flow_probe_zi"] = int(zi)
        print(f"Running build_pot_mesh with probe zi={zi} ...")
        verts, faces, diag = build_pot_mesh(
            H,
            70.0,
            45.0,
            3.0,
            3.0,
            r_drain,
            expn=1.1,
            n_theta=n_theta,
            n_z=n_z,
            style_opts=style_opts,
        )
        out_lines.append({"zi": zi, "diag": diag})
        print(f"Completed zi={zi}; diagnostics keys: {list(diag.keys())}")

    print(
        "Done running probes; verbose JSONL should contain entries for these zi values."
    )


if __name__ == "__main__":
    main()

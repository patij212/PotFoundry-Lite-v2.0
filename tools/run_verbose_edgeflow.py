import sys
import os
import importlib
from pathlib import Path


def main() -> None:
    # Ensure repository root is on sys.path for local imports (done at runtime)
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)

    # Lazy import heavy geometry implementation at runtime so type-checkers
    # and import-time execution don't pull in the large module.
    geom_mod = importlib.import_module("potfoundry" + ".core.geometry")
    build_pot_mesh = getattr(geom_mod, "build_pot_mesh")

    # Import presets dynamically to avoid static analysis importing pfui.
    PRESETS = importlib.import_module("pfui" + ".presets").PRESETS

    p = PRESETS["SuperformulaBlossom"]["Crisp Petals (De-Jag)"]
    style_opts = dict(p)
    style_opts["sf_edge_flow_reconstruct_enable"] = True
    style_opts["sf_edge_flow_mode"] = "ridge_paths"
    style_opts["sf_edge_flow_debug"] = True
    style_opts["sf_edge_flow_verbose_diagnostics"] = True
    # Force a probe zi to ensure we capture detailed arrays for investigation
    style_opts["sf_edge_flow_probe_zi"] = 42

    H = 120.0
    Rt = 70.0
    Rb = 45.0
    t_wall = 3.0
    t_bottom = 3.0
    r_drain = 10.0

    print("Running verbose edgeflow...")
    verts, faces, diag = build_pot_mesh(
        H,
        Rt,
        Rb,
        t_wall,
        t_bottom,
        r_drain,
        expn=1.1,
        n_theta=168,
        n_z=84,
        style_opts=style_opts,
    )
    print("Done; diagnostics keys:", list(diag.keys()))
    out = Path(".").resolve() / "tools" / "edgeflow_verbose_diagnostics.jsonl"
    print("verbose diagnostics path:", out)


if __name__ == "__main__":
    main()

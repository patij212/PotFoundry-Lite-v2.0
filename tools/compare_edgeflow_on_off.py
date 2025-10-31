import json
import sys
from pathlib import Path


def main() -> None:
    # Avoid importing heavy modules at import-time to keep focused mypy runs small.
    repo_root = Path(__file__).resolve().parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    import importlib

    geom_mod = importlib.import_module("potfoundry" + ".core.geometry")
    build_pot_mesh = getattr(geom_mod, "build_pot_mesh")
    PRESETS = importlib.import_module("pfui" + ".presets").PRESETS

    p = PRESETS["SuperformulaBlossom"]["Crisp Petals (De-Jag)"]

    H = 120.0
    Rt = 70.0
    Rb = 45.0
    t_wall = 3.0
    t_bottom = 3.0
    r_drain = 10.0

    def build_with(opts_overrides):
        style_opts = dict(p)
        style_opts.update(opts_overrides)
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
        # compute per-row min radii
        from collections import defaultdict

        zm = defaultdict(list)
        for x, y, z in verts:
            r = (x * x + y * y) ** 0.5
            zm[float(z)].append(r)
        rows = sorted(zm.keys())
        min_per_row = [(z, min(zm[z])) for z in rows]
        cnt_at_or_below = sum(1 for _, r in min_per_row if r <= r_drain + 1.0)
        return min_per_row, cnt_at_or_below

    print("Building with edge-flow OFF (defaults)")
    min_off, cnt_off = build_with(
        {"sf_edge_flow_reconstruct_enable": False, "sf_edge_flow_debug": False}
    )
    print("cnt_at_or_below (off):", cnt_off)

    print("\nBuilding with ridge_paths ON")
    min_on, cnt_on = build_with(
        {
            "sf_edge_flow_reconstruct_enable": True,
            "sf_edge_flow_mode": "ridge_paths",
            "sf_edge_flow_debug": False,
        }
    )
    print("cnt_at_or_below (on):", cnt_on)

    # write summaries
    out = Path(".").resolve() / "tools" / "edgeflow_compare.json"
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(
            {
                "off_count": cnt_off,
                "on_count": cnt_on,
                "min_off": min_off,
                "min_on": min_on,
            },
            fh,
        )
    print("wrote", out)


if __name__ == "__main__":
    main()

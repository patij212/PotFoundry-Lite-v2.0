import traceback

try:
    from pfui.presets import PRESETS
    from potfoundry.core.geometry import build_pot_mesh

    p = PRESETS["SuperformulaBlossom"]["Crisp Petals (De-Jag)"]
    style_opts = dict(p)
    # Force reporting parameters
    style_opts["sf_edge_flow_reconstruct_enable"] = True
    style_opts["sf_edge_flow_debug"] = True
    style_opts["sf_edge_flow_peak_q"] = 0.6
    style_opts["sf_edge_flow_max_paths"] = 12
    style_opts["sf_edge_flow_mode"] = "ridge_paths"
    style_opts["sf_edge_flow_valley_lock_enable"] = True
    # Ensure valley band present (so downstream code runs)
    style_opts["sf_edge_flow_valley_band_cols"] = 4
    H = 120.0
    Rt = 70.0
    Rb = 45.0
    t_wall = 3.0
    t_bottom = 3.0
    r_drain = 10.0
    print("Calling build_pot_mesh (force reports)...")
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
    print("build_pot_mesh finished; diagnostics keys:", list(diag.keys()))
except Exception:
    print("Exception during run:")
    traceback.print_exc()

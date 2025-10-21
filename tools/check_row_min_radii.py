import json
import sys
from pathlib import Path


def main() -> None:
    # Ensure the repository root is on sys.path so local package imports work when running from tools/
    repo_root = Path(__file__).resolve().parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    import importlib
    geom_mod = importlib.import_module('potfoundry' + '.core.geometry')
    build_pot_mesh = getattr(geom_mod, 'build_pot_mesh')
    PRESETS = importlib.import_module('pfui' + '.presets').PRESETS

    p = PRESETS['SuperformulaBlossom']['Crisp Petals (De-Jag)']
    style_opts = dict(p)
    # use defaults as the user requested (no edge flow overrides)
    style_opts['sf_edge_flow_reconstruct_enable'] = True
    style_opts['sf_edge_flow_debug'] = False
    style_opts['sf_edge_flow_mode'] = 'ridge_paths'

    H = 120.0
    Rt = 70.0
    Rb = 45.0
    t_wall = 3.0
    t_bottom = 3.0
    r_drain = 10.0

    print('Running build_pot_mesh for min-radius check...')
    verts, faces, diag = build_pot_mesh(H, Rt, Rb, t_wall, t_bottom, r_drain,
                                        expn=1.1, n_theta=168, n_z=84, style_opts=style_opts)
    # verts is array of (x,y,z). We need per-z ring minima of radius
    from collections import defaultdict
    zm = defaultdict(list)
    for x, y, z in verts:
        r = (x * x + y * y) ** 0.5
        zm[float(z)].append(r)
    rows = sorted(zm.keys())
    min_per_row = [(z, min(zm[z])) for z in rows]

    print('row_count', len(min_per_row))
    for z, rmin in min_per_row:
        print(f'{z:.3f}: {rmin:.6f}')

    min_overall = min(r for _, r in min_per_row)
    print('min_overall:', min_overall)
    print('drain_plus_one:', r_drain + 1.0)
    print('any_row_at_or_below_drain+1?', any(r <= (r_drain + 1.0) for _, r in min_per_row))

    # write a short JSON summary
    out = Path('.').resolve() / 'tools' / 'row_min_radii.json'
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump({'min_per_row': min_per_row, 'min_overall': min_overall, 'drain_plus_one': r_drain + 1.0}, fh)
    print('wrote', out)


if __name__ == '__main__':
    main()

"""
Small helper to run a single build_pot_mesh invocation with edge-flow debug flags
and append diagnostics. This is a quick utility for CI/local debugging.
"""
from pathlib import Path
import json
import time
import sys

repo_root = Path(r"C:\Users\patij212\Downloads\PotFoundry-Lite-v2.0")
sys.path.insert(0, str(repo_root))

from potfoundry.core.geometry import build_pot_mesh

style_opts = {
    'sf_edge_flow_reconstruct_enable': True,
    'sf_edge_flow_mode': 'ridge_paths',
    'sf_edge_flow_debug': True,
    'sf_edge_flow_verbose_diagnostics': True,
    'sf_edge_flow_probe': True,
    'sf_edge_flow_probe_zi': 42,
    'sf_edge_flow_valley_z_halfwin': 1,
}

# Use small mesh to keep runtime low
H = 120.0
Rt = 140.0
Rb = 90.0
wall = 3.0
bottom = 3.0
r_drain = 10.0

try:
    verts, faces, diag = build_pot_mesh(H, Rt, Rb, wall, bottom, r_drain,
                                       expn=1.1, n_theta=168, n_z=84,
                                       r_outer_fn=None, style_opts=style_opts)
    out = {'timestamp': time.time(), 'success': True, 'diag': diag}
except Exception as e:
    out = {'timestamp': time.time(), 'success': False, 'error': repr(e)}

outpath = repo_root / '.pf_edge_flow_debug.json'
with open(outpath, 'a', encoding='utf-8') as fh:
    fh.write(json.dumps(out, ensure_ascii=False))
    fh.write('\n')

print('wrote debug summary to', outpath)

# optionally print last few lines of tools/edgeflow_verbose_diagnostics.jsonl if exists
diagpath = repo_root / 'tools' / 'edgeflow_verbose_diagnostics.jsonl'
if diagpath.exists():
    with open(diagpath, 'r', encoding='utf-8') as fh:
        lines = fh.readlines()
    print('last diag jsonl lines:', len(lines))
    for L in lines[-3:]:
        print(L.strip())
else:
    print('no diag jsonl found at', diagpath)

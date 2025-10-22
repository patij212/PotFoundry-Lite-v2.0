"""Run a small, timed build_pot_mesh call for debugging hangs.

This script is intentionally minimal and prints timestamps so you can see where
it spends time (import vs function call).
"""

import time
import sys

print("python:", sys.executable)
print("start time:", time.time())
try:
    t0 = time.time()
    from potfoundry.core.geometry import build_pot_mesh, PotDefaults

    t1 = time.time()
    print(f"import done (dt={t1 - t0:.3f}s)")
except Exception as e:
    print("import failed:", repr(e))
    raise

# small, quick parameters
defaults = PotDefaults()
H = 50.0
Rt = 60.0
Rb = 40.0
t_wall = 2.0
t_bottom = 3.0
r_drain = 5.0

print("calling build_pot_mesh...")
call_t0 = time.time()
try:
    verts, faces, diag = build_pot_mesh(
        H, Rt, Rb, t_wall, t_bottom, r_drain, expn=1.0, n_theta=32, n_z=8
    )
    call_t1 = time.time()
    print(f"build_pot_mesh done (dt={call_t1 - call_t0:.3f}s)")
    print("verts.shape=", getattr(verts, "shape", None))
    print("faces.shape=", getattr(faces, "shape", None))
    print("diag keys sample=", list(diag.keys())[:10])
except Exception as e:
    print("build failed:", repr(e))
    raise

print("end time:", time.time())

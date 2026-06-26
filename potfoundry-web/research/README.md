# Meshing Research Lab

Dev-only oracle environment for benchmarking the in-house conforming mesher against SOTA engines (gmsh, Triangle).

## Setup

```bash
cd potfoundry-web/research/oracle && python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements.txt
```

Run smoke test: `.venv/Scripts/python.exe -m pytest tests/test_smoke.py -v`

## Engine Status

| Engine   | Version    | Smoke       | Note                                         |
|----------|------------|-------------|----------------------------------------------|
| gmsh     | 4.13.1     | PASS        | Pre-built wheel; carries anisotropic test    |
| triangle | 20230923   | PASS        | Pre-built wheel for win_amd64 / Python 3.11  |
| numpy    | 1.26.4     | (dep)       | Array backend                                |
| scipy    | 1.13.1     | (dep)       | Spatial / stats support                      |
| trimesh  | 4.4.3      | (dep)       | Mesh I/O / analysis                          |
| meshio   | 5.3.5      | (dep)       | Multi-format mesh I/O                        |

Python: 3.11.9 — `C:\Program Files\Python311\python.exe`
Platform: Windows 11 Pro / win_amd64
Tested: 2026-06-26 — 2 passed in 1.69s

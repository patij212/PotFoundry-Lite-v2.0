"""Small runtime check for PyVista/VTK and webgpu_renderer syntax.

Run from the project root with the virtualenv active (example paths):

Windows PowerShell:
    ./.venv/Scripts/python.exe tools/check_pyvista.py

Or using backslashes escaped if you prefer:
    .\\.venv\\Scripts\\python.exe tools\\check_pyvista.py

Prints results to stdout so you can paste them here.
"""
from __future__ import annotations

import py_compile
import sys
import traceback

try:
    import pyvista as pv
    print("pyvista imported, version:", pv.__version__)
except Exception as e:
    print("FAILED to import pyvista:", repr(e))
    sys.exit(1)

# Test creating a tiny Plotter in off_screen True/False
for off in (True, False):
    try:
        p = pv.Plotter(window_size=[16, 16], off_screen=off)
        p.close()
        print(f"plotter OK off_screen={off}")
    except Exception as e:
        print(f"plotter FAILED off_screen={off}: {e!r}")
        traceback.print_exc()

# Syntax check for webgpu_renderer.py
wgpu_path = "pfui/tabs/interactive/preview/webgpu_renderer.py"
try:
    py_compile.compile(wgpu_path, doraise=True)
    print(f"syntax OK: {wgpu_path}")
except py_compile.PyCompileError as e:
    print(f"SYNTAX ERROR in {wgpu_path}:")
    print(e)
    traceback.print_exc()
except Exception as e:
    print(f"Unexpected error compiling {wgpu_path}: {e!r}")
    traceback.print_exc()

print("done")

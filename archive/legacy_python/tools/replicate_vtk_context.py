"""Run small PyVista/VTK tests to reproduce OpenGL context issues.

Creates two quick attempts to render a sphere: first with an on-screen
window, then with `off_screen=True`. Saves screenshots and prints
diagnostic info and any caught exceptions.

Run from the repository root using the same venv used by Streamlit.
Example (PowerShell):

    .\\.venv\\Scripts\\python.exe tools\replicate_vtk_context.py

"""
import platform
import sys
import traceback

try:
    import pyvista as pv
    import vtk
except Exception as e:
    print("FAILED importing pyvista/vtk:", repr(e))
    raise

def info():
    print("Platform:", platform.platform())
    print("Python:", sys.version.replace("\n"," "))
    print("pyvista:", getattr(pv, "__version__", "unknown"))
    print("vtk:", getattr(vtk, "__version__", "unknown"))

def try_plot(off):
    out_png = f"tools/vtk_test_offscreen_{off}.png"
    print(f"\nAttempting Plotter(off_screen={off}) -> {out_png}")
    try:
        # Make sure we create a fresh Plotter each run
        p = pv.Plotter(off_screen=off, window_size=[400, 300])
        sph = pv.Sphere(radius=1.0)
        p.add_mesh(sph, color="lightsteelblue")
        # Use show with screenshot: will raise if context fails
        p.show(screenshot=out_png)
        print("Success: screenshot written to", out_png)
    except Exception:
        print("Exception while rendering (off_screen=%s):" % off)
        traceback.print_exc()

def main():
    info()
    # Try on-screen then off-screen
    for off in (False, True):
        try_plot(off)

if __name__ == "__main__":
    main()

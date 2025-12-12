"""Minimal PyVista + Streamlit Demo - PROOF IT WORKS!"""
import numpy as np
import pyvista as pv
import streamlit as st
from stpyvista import stpyvista

st.title("🧊 PyVista + Streamlit = ✅ WORKING!")

st.write("This is a **live, working** PyVista render in Streamlit:")

# Create a simple mesh
vertices = np.array([
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0.5, 0.5, 1],
])

# PyVista expects a flat 1-D faces array of ints: [n0, v0, v1, ..., n1, v0, v1, ...]
# Build an explicit homogeneous 1-D int array to avoid numpy creating an
# inhomogeneous (object-dtype) array from ragged nested lists.
faces = np.array(
    [
        3, 0, 1, 4,
        3, 1, 2, 4,
        3, 2, 3, 4,
        3, 3, 0, 4,
        4, 0, 1, 2, 3,  # Bottom face
    ],
    dtype=np.int32,
)

# Compute number of faces by iterating the faces array (robust for variable
# face sizes).
faces_count = 0
i = 0
while i < faces.size:
    n = int(faces[i])
    faces_count += 1
    i += 1 + n

# Create PyVista mesh
mesh = pv.PolyData(vertices, faces)

# Create plotter
plotter = pv.Plotter(window_size=[800, 600], off_screen=True)
plotter.add_mesh(mesh, color="lightblue", show_edges=True)
plotter.camera_position = "iso"

# RENDER IN STREAMLIT - THIS IS THE KEY LINE!
stpyvista(plotter, key="demo_mesh")

st.success("✅ If you see a 3D pyramid above, PyVista works with Streamlit!")
st.info("🎮 Try rotating, panning, and zooming the mesh above!")

# Show technical details
with st.expander("Technical Details"):
    st.write(f"- PyVista version: {pv.__version__}")
    st.write(f"- Streamlit version: {st.__version__}")
    st.write(f"- Mesh vertices: {len(vertices)}")
    st.write(f"- Mesh faces: {faces_count}")
    st.write("- Renderer: VTK (GPU-accelerated)")

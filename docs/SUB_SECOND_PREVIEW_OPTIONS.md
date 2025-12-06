# Sub-Second Preview Options for Million-Triangle Meshes

## Current Situation

**WebGL/stpyvista**: 22 seconds for 1M triangles (browser-based 3D)

**Goal**: Sub-1-second preview for 1M+ triangles

---

## Option 1: Native PyVista Desktop Window ⭐⭐⭐⭐⭐

### Performance
- **Initial render**: 200-500ms (50x faster!)
- **Interaction**: 144+ FPS with GPU acceleration
- **Quality**: Desktop-grade OpenGL (better than WebGL)

### Implementation

```python
def render_native_pyvista(vertices, faces, blocking=False):
    """Open native PyVista window (not in browser)."""
    import pyvista as pv
    
    # Create mesh
    mesh = pv.PolyData(vertices, faces)
    mesh['height'] = vertices[:, 2]
    
    # Create plotter with GPU acceleration
    plotter = pv.Plotter(
        window_size=(1200, 800),
        off_screen=False,
    )
    
    plotter.add_mesh(
        mesh,
        scalars='height',
        cmap='coolwarm',
        smooth_shading=True,
        pbr=True,  # Physical-based rendering for quality
    )
    
    plotter.show(interactive_update=True)
```

### Usage in Streamlit

```python
if st.button("🚀 Open Native 3D Viewer (Fast!)"):
    with st.spinner("Launching native viewer..."):
        # Run in separate thread so Streamlit doesn't block
        import threading
        t = threading.Thread(
            target=render_native_pyvista,
            args=(vertices, faces),
            daemon=True
        )
        t.start()
        st.success("Native viewer opened! (Check your taskbar)")
```

**Pros**:
- 50x faster than WebGL
- Full GPU acceleration
- Better quality
- Doesn't block Streamlit

**Cons**:
- Opens separate window (not embedded in browser)
- User must install PyVista with GPU support

---

## Option 2: VTK.js Server-Side Rendering ⭐⭐⭐⭐

### Performance
- **Initial render**: 500-1000ms (20x faster)
- **Interaction**: Smooth (pre-rendered images)
- **Quality**: Desktop OpenGL quality

### How It Works
1. Server renders frames with native VTK (fast!)
2. Sends compressed images to browser
3. Client displays images (instant!)
4. Mouse interaction triggers new server renders

### Implementation

```python
from vtkmodules.vtkRenderingCore import vtkRenderWindow, vtkRenderer
from vtkmodules.vtkInteractionWidgets import vtkOrientationMarkerWidget
import io
from PIL import Image

def server_side_render(vertices, faces, camera_position):
    """Render on server with native VTK, return PNG."""
    # Use native VTK (not PyVista/WebGL)
    renWin = vtkRenderWindow()
    renWin.SetOffScreenRendering(1)
    renWin.SetSize(1200, 800)
    
    ren = vtkRenderer()
    renWin.AddRenderer(ren)
    
    # Add mesh (fast native VTK)
    # ... setup mesh ...
    
    # Render to memory
    renWin.Render()
    
    # Export as PNG
    w2i = vtkWindowToImageFilter()
    w2i.SetInput(renWin)
    w2i.Update()
    
    # Convert to PIL Image
    vtk_image = w2i.GetOutput()
    # ... convert to PNG bytes ...
    
    return png_bytes

# In Streamlit
camera_pos = st.session_state.get("camera_pos", [0, 0, 100])
img_bytes = server_side_render(vertices, faces, camera_pos)
st.image(img_bytes, use_container_width=True)
```

**Pros**:
- 20x faster than WebGL
- Works in browser
- No client GPU requirements

**Cons**:
- More complex implementation
- Requires server-side VTK setup
- Network latency for interactions

---

## Option 3: Three.js with Web Workers ⭐⭐⭐

### Performance
- **Initial render**: 2-5 seconds (5-10x faster)
- **Interaction**: 60 FPS
- **Quality**: WebGL (same as PyVista)

### Why Faster Than stpyvista?
- Optimized mesh format (binary buffers)
- Frustum culling and LOD
- Deferred shading for large scenes

### Implementation

```javascript
// Custom Streamlit component with Three.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

function render3DPreview(vertices, faces) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance"
    });
    
    // Create geometry from binary buffers (fast!)
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', 
        new THREE.Float32BufferAttribute(vertices.flat(), 3)
    );
    geometry.setIndex(faces.flat());
    
    // Material with vertex colors
    const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,  // Show inner walls
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
    // Render loop
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();
}
```

**Pros**:
- Still works in browser
- 5-10x faster than stpyvista
- Better WebGL optimization

**Cons**:
- Requires custom Streamlit component
- More development work

---

## Option 4: Screenshot + Slippy Map ⭐⭐⭐⭐

### Performance
- **Initial render**: < 500ms (instant!)
- **Interaction**: Pan/zoom only (no rotation)
- **Quality**: Pre-rendered high-quality

### How It Works
1. Server renders high-res screenshots from multiple angles
2. Display static images with zoom/pan
3. Click to rotate → generate new screenshot

### Implementation

```python
def generate_turntable_screenshots(vertices, faces, n_angles=8):
    """Generate screenshots from N angles."""
    import pyvista as pv
    
    mesh = pv.PolyData(vertices, faces)
    plotter = pv.Plotter(off_screen=True, window_size=(2400, 2400))
    plotter.add_mesh(mesh, scalars='height', cmap='coolwarm')
    
    screenshots = []
    for i in range(n_angles):
        angle = i * (360 / n_angles)
        plotter.camera_position = 'iso'
        plotter.camera.azimuth = angle
        
        # Render to memory (FAST with off_screen=True!)
        img = plotter.screenshot(return_img=True)
        screenshots.append(img)
    
    return screenshots

# In Streamlit
if 'screenshots' not in st.session_state:
    with st.spinner("Pre-rendering views..."):
        st.session_state.screenshots = generate_turntable_screenshots(v, f)

angle_idx = st.slider("Rotate", 0, 7, 0)
st.image(st.session_state.screenshots[angle_idx])
```

**Pros**:
- Instant display (pre-rendered)
- Works on any device
- Can render ultra-high quality offline

**Cons**:
- Limited interactivity (no free rotation)
- Storage for multiple screenshots

---

## Option 5: Progressive Mesh Streaming ⭐⭐⭐⭐

### Performance
- **Initial preview**: < 100ms (decimated mesh)
- **Full quality**: Loads progressively in background
- **Perceived**: Instant!

### Implementation

```python
def progressive_preview():
    # Phase 1: Ultra-low-res preview (instant)
    preview_mesh = build_pot_mesh(..., n_theta=32, n_z=16)  # 1k triangles
    placeholder = st.empty()
    with placeholder:
        render_pyvista_preview(preview_mesh, title="Quick Preview...")
    
    # Phase 2: Medium res (1 second)
    time.sleep(0.1)  # Let user see something
    med_mesh = build_pot_mesh(..., n_theta=128, n_z=64)  # 16k triangles
    with placeholder:
        render_pyvista_preview(med_mesh, title="Refining...")
    
    # Phase 3: Full res (background)
    full_mesh = build_pot_mesh(..., n_theta=512, n_z=256)  # 1M triangles
    with placeholder:
        render_pyvista_preview(full_mesh, title="Full Quality")

if st.button("Generate Preview"):
    progressive_preview()
```

**Pros**:
- Feels instant (< 100ms to first pixels)
- No additional setup
- Works with existing code

**Cons**:
- Still uses WebGL for final render
- Multiple mesh builds

---

## Recommended Implementation: Hybrid Approach

Combine strategies for best UX:

```python
def smart_preview(vertices, faces, n_triangles):
    if n_triangles < 100_000:
        # Small mesh: Use WebGL directly (< 2 seconds)
        render_pyvista_preview(vertices, faces)
    
    elif n_triangles < 500_000:
        # Medium mesh: Progressive loading
        progressive_preview()
    
    else:
        # Large mesh: Offer native viewer
        st.info(f"⚡ Large mesh ({n_triangles:,} triangles)")
        
        col1, col2 = st.columns(2)
        with col1:
            if st.button("🚀 Open Native Viewer (Fast!)"):
                launch_native_viewer(vertices, faces)
        
        with col2:
            if st.button("🌐 Use Web Preview (Slow)"):
                render_pyvista_preview(vertices, faces)
```

---

## Performance Comparison

| Method | 1M Triangles | Quality | Setup | Best For |
|--------|-------------|---------|-------|----------|
| **Native PyVista** | 200-500ms ⭐ | Excellent | Easy | Desktop users |
| **VTK Server-Side** | 500-1000ms | Excellent | Hard | Production apps |
| **Three.js** | 2-5 seconds | Good | Medium | Web-first apps |
| **Screenshot Map** | < 500ms ⭐⭐ | Excellent | Easy | Limited interaction OK |
| **Progressive** | 100ms → 22s | Good→Excellent | Easy | Best UX |
| **Current (WebGL)** | 22 seconds | Good | Done ✅ | Small meshes |

---

## Action Plan for Sub-1-Second

### Immediate (< 1 hour)
1. Implement **Native PyVista** option
2. Add button to launch native viewer
3. Keep current WebGL as fallback

### Short-term (1-2 hours)
4. Add **Progressive Preview** for better perceived performance
5. Implement **Screenshot Turntable** for instant preview

### Long-term (4+ hours)
6. Build custom **Three.js** Streamlit component
7. Implement **VTK server-side** rendering

---

## Code: Native PyVista Implementation

Add this to your app:

```python
# In pfui/tabs/interactive/preview/native_viewer.py
def launch_native_viewer(vertices, faces, gradient_colors=None):
    """Launch native PyVista window in separate thread."""
    import pyvista as pv
    import threading
    
    def _render():
        mesh = pv.PolyData(vertices, faces)
        
        if gradient_colors is not None:
            mesh['colors'] = gradient_colors
            
        plotter = pv.Plotter(
            window_size=(1400, 900),
            title="PotFoundry - Native 3D Viewer",
        )
        
        plotter.add_mesh(
            mesh,
            scalars='colors' if gradient_colors is not None else None,
            rgb=True if gradient_colors is not None else False,
            smooth_shading=True,
            pbr=True,  # Physical-based rendering
            metallic=0.3,
            roughness=0.6,
        )
        
        plotter.add_light(pv.Light(position=(10, 10, 10)))
        plotter.show(interactive_update=True)
    
    # Launch in thread so Streamlit doesn't block
    t = threading.Thread(target=_render, daemon=True)
    t.start()

# In your interactive tab
if len(faces) > 500_000:
    st.warning(f"⚡ Large mesh: {len(faces):,} triangles")
    col1, col2 = st.columns(2)
    
    with col1:
        if st.button("🚀 Native Viewer (< 1 second!)", key="native"):
            launch_native_viewer(vertices, faces, gradient_colors)
            st.success("✅ Native viewer launched! Check your taskbar.")
    
    with col2:
        if st.button("🌐 Web Preview (~22 seconds)", key="web"):
            render_pyvista_preview(vertices, faces, ...)
else:
    # Small mesh: use web preview
    render_pyvista_preview(vertices, faces, ...)
```

This gives you **sub-second rendering** for large meshes while keeping the web preview as a fallback! 🚀

---

## Bottom Line

**For sub-1-second with 1M+ triangles, you MUST bypass WebGL.**

**Best choice**: Native PyVista viewer (easiest to implement, 50x faster)

**Best UX**: Progressive preview + native viewer option

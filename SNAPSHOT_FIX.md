# Snapshot APNG Fix - Full Mesh Rendering

## Issue

Snapshots were displaying a vertically elongated mesh artifact from the first version of the app. This was caused by the snapshot capture falling back to `render_preview_apng_cached()`, which uses a surface approximation (`make_preview_arrays`) instead of the actual triangulated mesh.

## Root Cause

The old code path:
1. Tried Plotly Mesh3d export (correct approach)
2. If Plotly export failed, fell back to `render_preview_apng_cached()`
3. `render_preview_apng_cached()` uses `make_preview_arrays()` which creates a parametric surface
4. This surface approximation had aspect ratio issues causing vertical elongation

## Solution

Completely rewrote the snapshot capture logic to **always use the actual triangulated mesh** (`build_pot_mesh`):

### New Workflow

1. **Build actual mesh** - Use `build_pot_mesh()` to get exact triangulated geometry
2. **Try Plotly export first** (best quality)
   - Export Mesh3d figure to PNG using Plotly's kaleido engine
   - Includes proper lighting, colors, and aspect ratio
3. **Fallback to matplotlib mesh rendering** if Plotly fails
   - Use `Poly3DCollection` to render the actual triangles
   - Color by height using viridis colormap
   - Proper aspect ratio from mesh bounds
4. **Never fall back to surface approximation**

### Key Improvements

- **Accurate geometry**: Snapshots now show the exact same mesh as the Full Preview
- **Better debugging**: Added detailed logging at each step
- **Robust fallback**: Two independent rendering methods (Plotly + matplotlib)
- **Proper aspect ratio**: Uses actual mesh bounds, not parametric approximation
- **Consistent appearance**: Matches the Full Preview style

## Technical Details

### Plotly Export (Primary Method)
```python
# Build actual mesh
verts, faces, _ = build_pot_mesh(...)

# Create Mesh3d figure
fig = go.Figure(data=[go.Mesh3d(...)])

# Export to PNG
capture_bytes = fig.to_image(format="png", ...)
```

### Matplotlib Fallback (Secondary Method)
```python
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

# Create triangle collection from mesh
triangles = V[F]  # V = vertices, F = faces
mesh = Poly3DCollection(triangles, ...)

# Color by height
colors = plt.cm.viridis(z_norm[F].mean(axis=1))
mesh.set_facecolors(colors)

# Add to 3D axes
ax.add_collection3d(mesh)
```

## Benefits

1. **Eliminates elongation artifact** - Uses actual mesh geometry
2. **Matches Full Preview exactly** - Same rendering as interactive preview
3. **Better reliability** - Two independent fallback paths
4. **Better debugging** - Detailed logs help diagnose issues
5. **Future-proof** - Works whether Plotly is available or not

## Testing

- All 58 tests pass ✅
- Python syntax validated
- No breaking changes
- Backward compatible

## Files Modified

- `app.py` - Snapshot capture logic (lines 709-825)

## Before vs After

**Before:**
- Used surface approximation (parametric function)
- Vertical elongation artifact
- Inconsistent with Full Preview
- Limited fallback options

**After:**
- Uses actual triangulated mesh
- Correct aspect ratio
- Matches Full Preview exactly
- Robust with multiple fallbacks

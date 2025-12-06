# Camera Persistence Feature

## Overview

The camera persistence feature automatically preserves your 3D preview orientation (camera angle) when the pot design is regenerated. This ensures a consistent viewing experience as you adjust parameters, change styles, or modify dimensions.

## How It Works

### Automatic Capture

When you interact with the 3D preview (rotate, pan, zoom), the camera position is automatically captured and stored in:
1. **Browser sessionStorage** - Persists within the current browser tab
2. **Streamlit session_state** - Persists during the current session

### Automatic Restoration

When the preview regenerates (due to parameter changes), the stored camera position is automatically applied to the new preview, maintaining your exact viewing angle.

## User Interface

### Camera Controls

Access camera controls via the **🎥 Camera Controls** expander in the preview section:

- **Status Indicator**: Shows whether a custom camera view is active
- **Reset View Button**: 🔄 Resets camera to default angle

### Default Camera

The default camera provides a standard isometric view:
- **Eye position**: (1.25, 1.25, 1.0)
- **Center**: (0, 0, 0)
- **Up vector**: (0, 0, 1)
- **Projection**: Orthographic

## Technical Details

### Architecture

The camera persistence system consists of several components:

1. **State Management** (`pfui/state.py`)
   - `get_preview_camera()`: Retrieve persisted camera
   - `set_preview_camera(camera)`: Store camera position
   - `ensure_initialized()`: Initialize camera state on app start

2. **Camera Capture** (`pfui/tabs/interactive/preview/camera_capture.py`)
   - `inject_camera_capture()`: JavaScript injection for automatic capture
   - `render_camera_controls()`: UI controls for camera management
   - `apply_camera_to_scene()`: Apply camera to Plotly scene config

3. **Preview Renderers**
   - `plotly_mesh.py`: Full mesh preview with camera persistence
   - `plotly_surface.py`: Quick surface preview with camera persistence

### JavaScript Implementation

Camera capture uses Plotly's `plotly_relayout` event:

```javascript
plot.on('plotly_relayout', function(eventData) {
    if (eventData['scene.camera']) {
        sessionStorage.setItem('pf_camera', JSON.stringify(eventData['scene.camera']));
    }
});
```

### Camera Data Structure

Plotly camera configuration follows this structure:

```python
{
    "eye": {"x": 1.25, "y": 1.25, "z": 1.0},      # Camera position
    "center": {"x": 0, "y": 0, "z": 0},           # Look-at point
    "up": {"x": 0, "y": 0, "z": 1},               # Up direction
    "projection": {"type": "orthographic"}         # Projection type
}
```

## Usage Examples

### Basic Usage

1. Open the Interactive Designer tab
2. Rotate the 3D preview to your preferred angle
3. Change any pot parameter (height, style, etc.)
4. The preview regenerates maintaining your camera angle

### Resetting the View

If you want to return to the default view:
1. Open **🎥 Camera Controls**
2. Click **🔄 Reset View**
3. The preview resets to the default angle

## Benefits

1. **Consistency**: Your viewing angle stays the same across regenerations
2. **Efficiency**: No need to manually reposition the camera after each change
3. **Workflow**: Faster iteration when designing pots
4. **Comparison**: Easier to compare different designs from the same angle

## Known Limitations

1. **Browser Session**: Camera persists only within the current browser tab
2. **Manual Interaction Required**: Camera must be manually rotated first (automatic capture starts after first interaction)
3. **Streamlit Session**: Camera resets when the Streamlit session restarts

## Future Enhancements

Potential improvements for future versions:

1. **Named Views**: Save multiple camera angles with custom names
2. **Preset Angles**: Quick buttons for common views (top, front, side, isometric)
3. **Synchronized Views**: Link camera across multiple preview modes
4. **Persistent Storage**: Save camera preferences across browser sessions

## Testing

Run camera persistence tests:

```bash
pytest tests/test_camera_persistence.py -v
```

## Code Quality

The camera persistence feature follows PotFoundry's coding standards:

- ✅ Comprehensive docstrings
- ✅ Type hints
- ✅ Unit tests
- ✅ Error handling
- ✅ Clean separation of concerns
- ✅ LLM-friendly documentation

## Troubleshooting

### Camera Not Persisting

**Problem**: Camera resets after regeneration

**Solutions**:
1. Ensure you've interacted with the 3D plot (rotated it at least once)
2. Check browser console for JavaScript errors
3. Try clicking **🔄 Reset View** then rotating again

### Camera Position Seems Wrong

**Problem**: Camera is at an unusual angle

**Solutions**:
1. Click **🔄 Reset View** to restore default
2. Rotate to your preferred angle
3. The new angle will be automatically saved

### Preview Doesn't Update

**Problem**: Camera controls don't affect the preview

**Solutions**:
1. Ensure preview mode is not set to "manual" (unless you want manual updates)
2. Try changing a parameter to trigger regeneration
3. Check that JavaScript is enabled in your browser

## Related Files

- `pfui/state.py` - Session state management
- `pfui/tabs/interactive/preview/camera_capture.py` - Camera capture logic
- `pfui/tabs/interactive/preview/plotly_mesh.py` - Mesh renderer
- `pfui/tabs/interactive/preview/plotly_surface.py` - Surface renderer
- `pfui/tabs/interactive/preview_impl.py` - Preview orchestrator
- `tests/test_camera_persistence.py` - Test suite

## Contributing

When modifying camera persistence:

1. Follow the existing patterns in `camera_capture.py`
2. Add tests for new functionality
3. Update this documentation
4. Ensure backward compatibility
5. Test across different browsers

## Version History

- **v2.1.1** (2024-11): Initial camera persistence implementation
  - Automatic camera capture via JavaScript
  - Session state persistence
  - UI controls for reset
  - Applied to both mesh and surface previews

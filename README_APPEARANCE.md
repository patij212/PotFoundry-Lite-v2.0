# Appearance & Preview Settings

This document summarizes the new appearance, performance and preview controls added in v2.

## Sidebar Sections

- Dimensions (mm): Physical size parameters used in geometry generation.
- Profile / Curve: Shape controlling exponents and bell/flare parameters.
- Mesh Quality: Base resolution of generated geometry (nθ, nz).
- Style Options: Style-specific parameter sliders (schema driven).
- Twist / Spin: Optional global twist modifiers.
- Presets: Built‑in and user‑defined collections of style option values.

## Preview & Export

- Preview detail (×): Multiplier applied to base nθ, nz for faster or higher fidelity quick preview geometry.
- Preview mode: manual / auto / debounced.
  - manual: You must click Update Preview.
  - auto: Re-renders immediately on parameter change.
  - debounced: Renders after inputs settle without pressing a button.
- Quick Preview: Lightweight surface plot (Plotly Surface) or static PNG fallback.
- Full Preview: Exact triangulated mesh (Plotly Mesh3d) with per-vertex gradient & lighting.
- Capture static mesh PNG: Forces regeneration of the heavy mesh snapshot even if geometry hash is unchanged.
- Mesh PNG status indicator: Shows whether last PNG was regenerated or served from cache and its build time.
- Export quality upscale: Integer multiplier (1–3) increasing nθ & nz only for STL export.

## Appearance & Preview Settings

### Color Mapping
- Palette preset: Choose predefined gradient or Custom.
- Gradient start / Mid / Gradient end: Hex colors; mid may be used for 3‑point interpolation.

### Mesh Lighting
- Ambient, Diffuse, Specular, Roughness, Fresnel: Directly passed to Plotly Mesh3d lighting (clamped 0–1).

### Background
- Preview background: Scene background color (interactive mesh).

### Resolution & Quality
- Preview resolution scale: Downscale factor for interactive performance.
- Manual mode full res: When enabled, manual mode high quality mesh PNG uses full base resolution.
- PNG dpi: DPI used when exporting fallback static PNGs.

## Caching & Hashing
Geometry hash factors: size parameters, wall/bottom thickness, drain, flare exponent, preview resolution, style name and style option values.
Appearance hash factors: gradient palette + lighting values.
If only the appearance hash changes, existing mesh PNG is reused to avoid expensive regeneration; you can force capture.

## Performance Logs
`Performance (dev)` expander lists recent timing entries: arrays, mesh_build, surface_plotly, mesh_plotly, mesh_png, color_map.

## Testing
`tests/test_colors.py` validates gradient interpolation, hex parsing and preset correctness.

## Future Enhancements
- Inline tooltips for each expander header.
- Additional regression tests for geometry/appearance hashing logic.

# STL Export Guide

## Overview

PotFoundry exports **binary STL** files directly in the browser. Binary STL is:

- **50-90% smaller** than ASCII STL
- **10x faster** to write
- **Universally supported** by all modern slicers and CAD tools

## How to Export

1. Adjust your pot parameters
2. Click **Download STL** in the Export panel
3. Choose quality level
4. Binary STL downloads automatically

## Quality Levels

| Level | Resolution | Triangles | Best For |
|-------|------------|-----------|----------|
| Low | 84x42 | ~14k | Quick preview |
| Medium | 168x84 | ~56k | Standard prints |
| High | 252x126 | ~127k | High detail |
| Ultra | 336x168 | ~226k | Maximum quality |

## Mesh Fidelity

For technical details on the export pipeline, feature-aware tessellation, and mesh quality:

- [STL_FIDELITY_REVIEW.md](../../potfoundry-web/docs/STL_FIDELITY_REVIEW.md) — Comprehensive technical analysis
- [STL_PIPELINE_ROADMAP.md](../../potfoundry-web/docs/STL_PIPELINE_ROADMAP.md) — Improvement roadmap
- [AGENT_CONTEXT_DISTILLED.md](../AGENT_CONTEXT_DISTILLED.md) §3 — Full pipeline reference

## Validating STL Files

Upload to [viewstl.com](https://www.viewstl.com/) or open directly in your slicer (PrusaSlicer, Cura, etc.).

All exported meshes are watertight with consistent face winding (counter-clockwise outward).

---

**Last Updated:** March 2026

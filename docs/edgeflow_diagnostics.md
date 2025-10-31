Edgeflow diagnostics

This document describes the canonical verbose diagnostics produced by the edge-flow routine in
`potfoundry.core.geometry` and how to enable/disable file-based writes.

Canonical diagnostic keys (per-row)

The mesh builder (build_pot_mesh) attaches in-memory diagnostics to the returned
`diagnostics` dict under the key `edgeflow_verbose` when `style_opts['sf_edge_flow_verbose_diagnostics']` is True.
Each entry is a dictionary with a `rows` list; each `row` contains the canonical keys below.

- `zi` (int): ring index (0..Z-1) that this row corresponds to.
- `z` (float): physical Z coordinate for the ring.
- `min_final_raw` (float): minimum of the final raw radii for the ring.
- `R_raw_sample` (list[float] | None): sampled raw-frame radii before flow analysis.
- `R_analysis_sample` (list[float] | None): sampled radii in the analysis (twist-compensated) frame used for computations.
- `Env_sample` (list[float] | None): the local envelope constructed during analysis.
- `Env_to_use_sample` (list[float] | None): the envelope chosen for lifting (may be origin-mapped or shifted).
- `Env_to_use_raw_post` (list[float] | None): the envelope mapped/aligned back into the raw-theta frame (post any deoffset adjustment).
- `origin_map_sample` (list[int] | None): mapping from analysis columns to raw-theta source columns used for origin-preserving lifting.
- `R_new_sample` (list[float] | None): lifted radii in the analysis frame (before mapping to raw frame).
- `R_new_raw_sample` (list[float] | None): final radii in the raw-theta frame that will be used to place vertices.
- `enforcement_violations_count` (int | None): number of theta columns where final raw radii were below the applied envelope (pre final-enforcement correction).
- `enforcement_violations_indices` (list[int] | None): list of theta column indices where such violations were detected.

Additional entries

- Some diagnostics dumps include `stage` or `deoffset` top-level fields for post-deoffset summaries, and compact final-enforcement summaries with keys like `total_changes` and `per_row_changes`.

Flags and how to control diagnostics

- `sf_edge_flow_verbose_diagnostics` (bool)
  - Default: False
  - When True, the builder emits verbose diagnostics for rings near the drain or for the requested `probe_zi`.
  - Diagnostics are both written to disk (JSONL) and collected in-memory.

- `sf_edge_flow_verbose_write_file` (bool)
  - Default: True
  - When True (default) verbose diagnostics are appended to `tools/edgeflow_verbose_diagnostics.jsonl` in the repository root and small debug stamps may be written to `.pf_edge_flow_debug.json`.
  - When False, no JSONL or debug stamp files are written; the in-memory diagnostics (`diagnostics['edgeflow_verbose']`) are still populated and available to callers and tests. This is useful for CI to avoid disk I/O.

- `sf_edge_flow_probe` (bool)
  - When True, a single `probe_zi` can be requested via `sf_edge_flow_probe_zi` to force one diagnostic row to be produced for inspection (useful in tests).
  - `sf_edge_flow_probe_zi` default value: 42 (the code defaults to 42 when not set). Use an integer within the vertical ring range.

Example: request in-memory diagnostics only (no file writes)

```python
import numpy as np
from potfoundry.core.geometry import build_pot_mesh

# Minimal style_opts to request diagnostics but disable file writes
style_opts = {
    'sf_style': 'SuperformulaBlossom',            # prefer explicit style hint for determinism
    'sf_edge_flow_reconstruct_enable': True,
    'sf_edge_flow_verbose_diagnostics': True,      # enable verbose diagnostics
    'sf_edge_flow_verbose_write_file': False,      # disable writing JSONL files (CI-friendly)
    'sf_edge_flow_probe': True,
    'sf_edge_flow_probe_zi': 2,
}

# Call the mesh builder (example parameters)
verts, faces, diagnostics = build_pot_mesh(
    H=7.0, Rt=40.0, Rb=40.0, t_wall=2.5, t_bottom=4.0, r_drain=3.0,
    expn=1.0, n_theta=24, n_z=6,
    r_outer_fn=lambda th, z, r0, H_local, opts: np.ones(24) * 15.0,
    style_opts=style_opts,
)

# Inspect in-memory diagnostics (if any)
ev = diagnostics.get('edgeflow_verbose') if isinstance(diagnostics, dict) else None
if ev:
    # ev is a list of dump entries; examine the first row
    entry = ev[0]
    rows = entry.get('rows') or []
    if rows:
        row = rows[0]
        print('zi:', row.get('zi'))
        print('R_new_raw_sample length:', len(row.get('R_new_raw_sample') or []))

```

Notes and recommendations

- Prefer passing an explicit `sf_style` string to avoid heuristics that inspect function identity or names.
- For deterministic testing, disable twist compensation (`sf_edge_flow_twist_compensate = False`) and `sf_edge_flow_auto_deoffset = False` so the analysis frame maps identically to raw-theta.
- When `sf_edge_flow_verbose_write_file` is False the code still returns canonical in-memory diagnostics so tests can assert correctness without disk side effects.

If you'd like, I can add a small unit test that asserts that when `sf_edge_flow_verbose_write_file` is False no file is created but `diagnostics['edgeflow_verbose']` is populated.

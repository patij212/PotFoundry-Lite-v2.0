# Export Topology/Search Acceleration — Four-Agent Decision

Date: 2026-07-10

## Scope

Implement three byte-identical export accelerations:

1. Sparse paged quadtree leaf occupancy instead of `Set` storage.
2. One immutable finalized topology with per-side adjacency and edge points.
3. Reusable budget-search evidence instead of repeating sampler work and node discovery.

## Debate

### Generator — ACCEPT, staged

- Use sparse bitmap pages partitioned by `(level,uExtra)`; a dense level bitmap is impossible at CAD levels.
- Preserve legacy insertion order with an append log and live-generation filtering.
- Build topology only after square balance and directional refinement finish.
- Cache raw curvature and cell evidence across budget probes; preserve terminal-tree reuse.

### Verifier — ACCEPT WITH REQUIRED AMENDMENTS

- Delete/re-add requires per-key generations; a membership-only tombstone would resurrect the old Set position.
- Four split bits alone are insufficient: directional transitions can have multiple points per edge.
- Final topology cannot accelerate mutable balancing; use occupancy there and immutable CSR only afterwards.
- Scale is applied before clamp and global Lipschitz grading, so no single scalar node threshold is exact.
- Feature triangulation must merge structural edge points with feature/rail edge points using unchanged quantization/sort/dedup.

### Executioner — ACCEPT WITH REQUIRED AMENDMENTS

- Retain `uByEffective` during the first storage slice to avoid combining directional-neighbour semantics with storage migration.
- Ship plain topology consumption before feature topology consumption, with parity after each.
- Cache raw curvature, metric samples, and feature/crease intersections, but replay exact scale-specific grading and balance.
- Defer mutable adjacency and copy-on-write tree snapshots until profiling proves the staged work insufficient.

### Master — APPROVE AMENDED DESIGN

Implementation order:

1. `PagedLeafStore` + differential Set-order tests + PBQ integration.
2. `QuadtreeTopology` CSR edge slices + plain triangulator + feature structural merge.
3. Budget-search workspace caching raw sizing and scale-independent cell evidence.
4. Exact parity, topology, five-style hash, typecheck, lint, test, and performance capture gates.

## Non-negotiable invariants

- Identical ordered leaves, vertices, indices, provenance, seam flags, chosen scale, leaf counts, validation, and mesh hashes.
- Preserve DFS child order and balance queue order.
- Preserve seam wrapping, QSCALE quantization, subdivision sorting, and triangle-template order.
- Directional refinement remains disabled in search and retains its separate final rebuild.
- Each slice must be independently revertible and measured.


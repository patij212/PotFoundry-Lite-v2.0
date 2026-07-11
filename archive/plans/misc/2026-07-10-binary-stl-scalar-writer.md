# Binary STL Scalar Writer — Performance and Safety Specification

## Objective

Reduce allocation and garbage-collection pressure during binary STL emission for every mesher without changing an emitted byte, winding rule, validation rule, file layout, or download route.

## Evidence and scope

- `generateBinarySTL` and `generateStreamingSTLBlob` currently allocate three vertex tuples, two edge tuples, one cross-product tuple, and one normalized-normal tuple for every facet.
- At 8.73M facets this is roughly 61M short-lived JavaScript arrays after the existing orientation pass. The default download route selects the streaming writer above 1M facets, so both writers must share the optimization.
- The current export-stage capture stops before file serialization. This change is therefore a universal allocation reduction, not a claimed percentage of total export time.

## In scope

1. Add one private scalar facet-writing helper used by both binary writers.
2. Read and sanitize vertex scalars exactly as today: any non-finite vertex becomes `(0,0,0)`.
3. Reproduce `computeNormal`'s subtraction, cross-product, normalization, degenerate fallback `(0,0,1)`, and final normal sanitization in the same arithmetic order.
4. Preserve the existing little-endian 50-byte facet layout and `DataView` write order.
5. Pin pre-change FNV-1a byte hashes for finite/orientation, degenerate, and non-finite fixtures before implementation.

## Explicitly out of scope

- `orientMeshForSTL`, its winding behavior, and its Map-based topology implementation.
- STL Blob/file streaming semantics, chunk size, download activation, OBJ/3MF, and mesh generation.
- Changing facet order, normal precision, or replacing the `DataView` writer with WebAssembly/GPU code.

## Safety invariants

- `generateBinarySTL` output bytes match the pre-change fixtures exactly.
- `generateStreamingSTLBlob` uses the same scalar helper, so its facet bytes follow the same code path as the direct writer.
- Source mesh vertices and indices remain unmodified; orientation still returns its copied index buffer.
- The optimization has no flag and no fallback because it is pure local arithmetic; a failing byte-hash gate blocks it.

## Validation plan

1. Add failing pre-change byte-hash tests for a coherent/incoherent quad and an invalid/degenerate mesh.
2. Implement the helper and make both binary loops call it.
3. Run the STL writer, round-trip, and parametric export-hook tests plus targeted lint and typecheck.
4. Capture a real high-triangle serialization profile separately before considering any orientation bypass or streaming redesign.

## Rollback

Revert only the private facet helper and its two call sites. No mesh data, user setting, or serialized-format migration is involved.

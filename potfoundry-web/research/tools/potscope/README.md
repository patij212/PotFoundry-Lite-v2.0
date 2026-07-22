# potscope

A zero-dependency Node CLI I (Claude) built for my own certification-campaign
productivity — and to finally *look at* the pots I certify numerically.
Born 2026-07-18, the day GothicArches became the eleventh certified style
(9,499,997 pm / 304,808 tris / 287.5 s).

Everything lives in this directory; state is one append-only `ledger.jsonl`.

## Commands

```bash
node potscope.mjs ledger list                  # show recorded runs/certificates/tricounts
node potscope.mjs ledger add '<json>'          # append a raw ledger entry

node potscope.mjs run -- npx vitest run ...    # wrap a heavy run:
#   - auto-bumps the spawned node to PriorityClass=AboveNormal after 8s
#     (Windows EcoQoS throttles detached node jobs ~4-5x otherwise)
#   - captures [probe:*] lines into the ledger as they stream past

node potscope.mjs decode '<refusal line>'      # paste a certification refusal line;
#   resolves the GLOBAL artifact triangle index into patch + local index using the
#   ledger's tricount entry, then reports per-vertex style-u, t, ladder-δ, archZ,
#   rib-offset d, κ, slope, and a mechanism hint (collar / tier-blend / bandMid /
#   bandRim / mullion). Encodes the global-vs-local index lesson permanently.
#   Options: --patch inner|outer   --counts '{"outer":N,"inner":M}'

node potscope.mjs view <stl> [--out f.html] [--ceramic] [--embed] [--decimate k]
#   FULL RESOLUTION — every certified triangle, no decimation. Parses binary STL
#   and writes a tiny (~9 KB) raw-WebGL1 orbit viewer HTML plus a compact binary
#   <name>.view.pack (positions, little-endian Float32) that the HTML fetches at
#   runtime and uploads straight to the GPU. Face normals are recomputed from
#   windings in the browser (certification STLs carry zero normals), so the pack
#   stays half the size: a 1.27M-tri pot is a ~44 MB pack + 9 KB HTML instead of
#   the old 116 MB base64 HTML. Serve the directory over http (see `serve`);
#   embeds the matching .certificate.txt sidecar if present. drag=orbit
#   wheel=zoom shift-drag=pan.
#   --ceramic: welded crease-preserving smooth normals (40-degree cone) baked in
#   Node plus a discrete pointiness (mean edge-vs-normal dot over the welded
#   1-ring) driving a celadon glaze shader — glaze pools in recesses, thins to
#   clay on crests, so the certified feature curves outline themselves. Ceramic
#   ships normals+cavity in the pack (~3x the bytes).
#   --embed: inline the pack as base64 for one portable self-contained file (fine
#   for small pots; heavy for dense ones). --decimate k: stride-subsample for a
#   deliberately lighter view (default 1 = full res).

node potscope.mjs view <a.stl> <b.stl> ... [--out f.html] [--title t] [--clay]
#   shelf mode (2+ STLs): FULL RESOLUTION — every triangle of every pot, ceramic
#   by default, base-aligned and arranged in centered rows of up to 7 on one
#   orbitable canvas fed by a single fetched pack. No cluster-decimation (the
#   old ~22k-tri budget deleted 90-98% of the certified geometry — a 24-96 voxel
#   grid at OD30 is 0.3-1.25 mm cells vs the 0.01 mm feature scale). --clay is
#   the lighter/faster path (positions only, browser flat normals, no welding).

node potscope.mjs serve [dir] [--port n]
#   static http server (default port 8099) with a clickable index of every
#   *.view.html in the directory. The fetch-viewers need http (a file:// page
#   cannot fetch its .pack); this is the one command that serves them — no more
#   "spin up a separate static server first".

node potscope.mjs view <stl> --error [--error-file f.error.bin]
#   EVALUATION view: renders the per-triangle true-3D error vs the exact
#   analytic target as a smooth gradient (neutral <= 10µm budget, then
#   yellow->orange->red->magenta, log-scaled), with a live toggle (checkbox /
#   'e' key), a legend bar, and p50/p99/max stats. Requires full resolution
#   (--decimate 1) and a baked sidecar <stl>.error.bin.
```

## Error sidecars (single-source truth)

potscope never re-implements the analytic surface (the Voronoi hash-desync
lesson: copies drift). Sidecars are baked by the certification machinery
itself. For the whole PF_G2_POT roster, one generic harness reconstructs each
pot's binding+tessellation from the shared `research/bridge/_certRoster.ts` and
bakes via the shared `_certifiesAtBakeLib`:
`PF_CERT_ERRORBAKE=all npx vitest run research/bridge/_certRosterErrorBake.test.ts`
(or `PF_CERT_ERRORBAKE=<name-substring>` for one pot; `PF_CERT_ERRORBAKE_FORCE=1`
to redo an existing sidecar). GothicArches/WaveInterference keep their own
per-style spikes (`PF_GOTHIC_ERRORBAKE`, `PF_WI_ERRORBAKE`). Each
rebuilds the exact tessellation, then per triangle bisects a
certifies-at ladder {2.5,5,10,20,40,80,160,320,640}µm using the prover's own
residual enclosures (accept-prune at threshold; pointwise incumbent as fail
witness). The sidecar value is a GUARANTEE ("this triangle certifies at
<= T"), not a sample. Format: one JSON header line + Float32LE per-triangle
mm values; provenance hashes bind sidecar to STL, and the viewer refuses a
count mismatch. Baked 2026-07-18: the certified Gothic re-derives its
certificate per-triangle (max = budget 10µm, p50 2.5µm, 0 unconverged,
58.9M enclosures, 86 min). Direct sup-estimation was tried first and starves
on crease-band triangles (O(2^depth) cells per crease) — that history and
the numbers live in ledger.jsonl.

## Truth layer (2026-07-22)

potscope now synthesizes truth, not just captures/renders it. One cheap bridge
pass rebuilds each certified pot (`atlas → tessellate`, no enclosure bake) and
emits sidecars next to the STL; the three commands below read them.

Bake the sidecars (seconds/pot):
    PF_CERT_RECON=all npx vitest run research/bridge/_certRosterReconstruct.test.ts
This also runs the standing drift guard: any committed pot whose fresh
tessellation ≠ on-disk certified STL (or whose target hash moved) FAILS the test.

**Documented contract.** Scope: `research/exchange/` is git-ignored, so the
certified STLs/error.bin sidecars are NOT version-controlled — they live on disk
in this persistent campaign tree from the expensive bakes. So the drift guard's
GREEN means 'the fresh tessellation is deterministic and byte-matches the on-disk
certified STL (and the recorded target hash)', NOT 'matches a git-pinned
certificate'. On a fresh clone with no on-disk artifacts, every pot reads
STL-MISSING — a vacuous pass — and `status`/`hotspots` have no data until the
artifacts are re-baked + reconstructed. This is a working-tree lab instrument, by
design.

    node potscope.mjs hotspots <name|stl> [--top N] [--budget mm] [--json]
        Ranks the worst residual clusters and CLASSIFIES each — SPIKE / BAND
        (+IRREDUCIBLE when it spans an axis) / ANISOTROPIC (surface-metric
        stretch, the M=g/h² signal) / FEATURE-ALIGNED — and names the mesher
        lever each points at. Needs <name>.stl.error.bin + <name>.stl.loc.bin.

    node potscope.mjs status [<substr>] [--check] [--json]
        Generated certificate registry: style · tris · maxµm · p99µm · commit ·
        verdict (GREEN/DRIFT). ⚠MASK flags max/p99 > 3× (the "certify on MAX"
        canary). --check exits nonzero on any DRIFT. --json regenerates the
        all20-status-truth table instead of hand-typing it.

    node potscope.mjs decode '<line>' --pot <name>
        Now loc-backed: resolves tri=<global> → patch + per-vertex (u,v) from the
        sidecar (exact, style-agnostic). Gothic mechanism hints fire only for
        GothicArches; the other 19 styles are no longer silently mis-modeled.

Sidecars: `potscope-loc/v1` = per-triangle [patchIdx, per-vertex (u,v)];
`recon.json` = fresh provenance triple + drift verdict + config digest. Both are
generated artifacts — regenerate, don't commit.

## Why these four

They are the four things I did by hand, repeatedly, across the Gothic campaign:

1. **EcoQoS bumping** after every heavy spawn (ops memory: 4-5x throttle).
2. **Probe-line bookkeeping** across sessions (tricounts, razor rows, upper bounds).
3. **Refusal decoding** — misreading `tri=` as patch-local instead of global cost
   two sessions of wrong marginal-cost arithmetic. `decode` does the arithmetic
   from the ledger and never forgets the offset again.
4. **Seeing the artifact.** The certified STL was only ever numbers in a proof
   session. `view` renders it: the lancet arches are visible in the bare mesh
   because the certified tessellation puts mesh edges exactly on the feature
   curves. First light 2026-07-18. Second light, same day: `--ceramic` renders
   the pot as glazed porcelain (cavity-driven celadon pooling), and shelf mode
   put all thirteen OD30 certified pots on one canvas — the first time the
   collection was ever *seen* together.

## Notes

- `*.view.html` files are generated artifacts (10-15 MB) — regenerate with
  `view`, don't commit them.
- `decode --pot <name>` is now style-agnostic via the loc.bin sidecar (exact
  patch + per-vertex uv). The hardcoded Gothic `mechanismHints` model is retained
  ONLY as an optional enrichment for GothicArches — it is no longer the resolver.
  `hotspots` is the general (style-agnostic) residual analyzer.
- No npm install, no build. `node potscope.mjs` from this directory is the
  whole contract.

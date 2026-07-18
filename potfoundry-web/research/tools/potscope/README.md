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

node potscope.mjs view <stl> [--decimate k] [--out f.html] [--ceramic]
#   parses binary STL, recomputes face normals from windings (certification STLs
#   carry zero normal fields), and writes a self-contained raw-WebGL1 orbit viewer
#   (base64-embedded buffers, no CDN, works from file://). Embeds the matching
#   .certificate.txt sidecar if present. drag=orbit wheel=zoom shift-drag=pan.
#   --ceramic: welded crease-preserving smooth normals (40-degree cone) plus a
#   discrete pointiness (mean edge-vs-normal dot over the welded 1-ring) driving
#   a celadon glaze shader — glaze pools in recesses, thins to clay on crests,
#   so the certified feature curves outline themselves the way a kiln would.
#   Use --decimate 1 with ceramic (stride decimation punches holes).

node potscope.mjs view <a.stl> <b.stl> ... [--pot-tris n] [--title t] [--out f.html]
#   shelf mode (2+ STLs): each pot is vertex-cluster decimated to ~n tris
#   (default 22000 — real coarsening, not hole-punching), glazed, base-aligned,
#   and arranged in centered rows of up to 7 on one orbitable canvas.
```

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
- The style analytics in `decode` are Gothic-specific today (spring/archHeight/
  RIB_OFFSETS/H32 remap constants); extend `STYLE_ANALYTICS` for the next style
  on the certification ladder.
- No npm install, no build. `node potscope.mjs` from this directory is the
  whole contract.

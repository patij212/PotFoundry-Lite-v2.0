# MCP Agent Guidance Design
_2026-03-07_

## Goal

Make every agent (Claude Code, GitHub Copilot, Continue, Cline) automatically reach for the
right MCP server for each class of task, rather than guessing or using code paths as proxies.

## Approved Approach — Option B: Task-to-tool trigger tables + Memory seeding

### What we are NOT doing
- Rewriting the agent lifecycle protocol in `agents.md` (too risky)
- Creating a separate MCP_TOOLS.md (adds indirection)
- Adding Python-focused guidance anywhere (Python app is deprecated)

---

## Section 1 — Memory MCP: Seeding + Persistence Fix

### 1a. Persistence fix
Currently neither Claude Code nor VS Code have `MEMORY_FILE_PATH` set. The server writes
to a transient working directory that may differ across restarts — data will be lost.

Fix: set `MEMORY_FILE_PATH` to `C:/Users/patij212/.claude/memory/potfoundry.jsonl` in
both configs:
- `~/.claude.json` — user-scope `memory` server `env`
- `C:/Users/patij212/AppData/Roaming/Code - Insiders/User/mcp.json` — memory server `env`

### 1b. Entities to seed (~25 facts across 5 categories)

**Architecture**
- PotFoundry is a TypeScript/React SPA on Cloudflare Pages. WebGPU primary, WebGL fallback.
- Auth: Supabase. Payments: Stripe. State: Zustand. Rendering: WGSL shaders.
- Export paths: (1) Legacy CPU, (2) GPU Grid, (3) Adaptive Subdivision, (4) Parametric (current best).
- Parametric pipeline: 8-stage CPU+GPU hybrid in `src/renderers/webgpu/parametric/`.
- `webgpu_core.ts` is a 5500-line monolith — refactor with extreme caution.

**Irreversible decisions (must never be reverted)**
- No cdt2d in parametric pipeline (was O(n²), 12+ min at production scale).
- No CDF-adaptive grid spacing (caused visible density-band artifacts, removed v16.10).
- No stitch fan vertices (created visible rings, removed v16.9).
- No GPU snap/relax (replaced by CPU merge-and-insert at v7.2).
- `CHAIN_LOCK_BAND_HALF_WIDTH = 1` must stay — reverting to 0 re-enables diagonal crease bug.
- Style IDs in STYLE_REGISTRY are permanent — serialized into localStorage and GPU buffers.

**Active work items**
- 53% of outer-wall vertices have valence < 5 — structural from chain-vertex fan topology.
- Tall cross-row triangles still present after subdivision pass.
- Diagonal boundary crease under investigation (regression test: diagonalConsistency.test.ts).
- `weldMesh.ts` string-key dedup crashes browser at large exports — needs spatial sort welder.
- Adaptive GPU subdivision creates T-junctions — causes mesh cracks.

**Key invariants**
- Supabase client in `services/supabase.ts` can be null — always call `isSupabaseConfigured()`.
- ConsolePatch installed in main.tsx before React mounts — don't assume native console behaviour.
- ESLint: 0 max-warnings policy — any warning fails CI.
- WGSL vec3<f32> requires 16-byte alignment — missing padding causes silent export corruption.
- Export requires WebGPU — no CPU fallback when renderer fell back to WebGL.
- `strips shaderCode()` removes inactive style functions before GPU upload.

**Dev workflow**
- Hooks: `env-guard.js` (blocks .env edits), `eslint-check.js` (post-edit lint on .ts/.tsx).
- Journal: `agents_journal.md` is append-only multi-agent forum — read last 5-10 entries first.
- E2E tests require running dev server — start `npm run dev` before `npm run test:e2e`.
- Adding a new style: registry.ts → WGSL shader → geometry/styles.ts → regenerate fixtures.

---

## Section 2 — CLAUDE.md additions

Add `## MCP Tools` section after the existing `## Commands` section.

Content: one-liner ("check memory before reading journal") followed by trigger table:

| Task | Use this MCP | Instead of |
|---|---|---|
| Check/update user subscription tier | `stripe` | reading `services/stripe.ts` |
| Query auth records, export counts, RPC | `supabase` | guessing SQL structure |
| Check if a Cloudflare Pages deploy succeeded | `cloudflare-builds` | reading build_log.txt |
| Manage Workers KV / D1 bindings | `cloudflare-bindings` | wrangler CLI guesswork |
| Look up React/Three.js/Radix/Zustand API docs | `context7` | hallucinating APIs |
| Run or debug E2E tests in a real browser | `playwright` | describing expected behaviour |
| Check open issues or PR status | `github` | asking the user |
| Recall decisions from previous sessions | `memory` | re-reading the whole journal |
| Navigate symbols, find references | `serena` | broad file grepping |

---

## Section 3 — agents.md additions

Two additions, zero changes to existing lifecycle.

**3a. New Phase 0 — "Orient before you work" (insert before Phase 1)**
```
Phase 0 — MCP orientation (< 2 min)
1. Query memory MCP: search_nodes("potfoundry") → loads distilled project knowledge
2. If memory returns results, skip journal reads for facts already covered there
3. If memory is empty, proceed to journal Phase 1 as normal
```

**3b. New "MCP Toolbox" section (cross-agent, append after Section 5)**
Compact table of tools available to all MCP-compatible agents:

| Task | Tool |
|---|---|
| Live API docs for any library | `context7` |
| Database queries / Supabase RPC | `supabase` |
| E2E browser testing | `playwright` |
| PR / issue status | `github` |
| Cross-session memory / project knowledge | `memory` |

---

## Section 4 — copilot-instructions.md overhaul

The file currently describes the deprecated Python/Streamlit app. Replace with:
- Project overview reflecting the TypeScript/React/WebGPU web app
- Architecture section mirroring agents.md Section 2
- Coding standards: TypeScript strict, no `any`, JSDoc, ESLint 0-warnings
- Testing: Vitest (unit) + Playwright (E2E)
- Git workflow: conventional commits (unchanged — already correct)
- MCP Tools section with full web app trigger table (same as CLAUDE.md Section 2)
- Working with LLMs section: add "query memory MCP before reading ARCHITECTURE.md"

---

## Additional infrastructure changes

### Fix VS Code mcp.json: add Serena + Cloudflare + memory path
Add to `C:/Users/patij212/AppData/Roaming/Code - Insiders/User/mcp.json`:
- `serena`: `uvx --from serena serena-mcp-server --project-path <workspace>`
- `cloudflare-bindings`: `npx mcp-remote https://bindings.mcp.cloudflare.com/mcp`
- `cloudflare-builds`: `npx mcp-remote https://builds.mcp.cloudflare.com/mcp`
- `memory`: add `MEMORY_FILE_PATH` env to existing entry

### Fix Claude user config: add memory path
Update `memory` server in `~/.claude.json` to set `MEMORY_FILE_PATH`.

---

## Implementation order

1. Fix MEMORY_FILE_PATH in both configs (prerequisite — must persist before seeding)
2. Seed Memory MCP with 25 entities
3. Update CLAUDE.md (add MCP Tools section)
4. Update agents.md (add Phase 0 + MCP Toolbox section)
5. Overhaul copilot-instructions.md
6. Update VS Code mcp.json (Serena + Cloudflare + memory path)

# MCP Agent Guidance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure every agent (Claude Code, GitHub Copilot, Continue, Cline) automatically reaches for the correct MCP server for each task type, backed by a persistent memory graph seeded with core project knowledge.

**Architecture:** Fix Memory MCP persistence first (so seeds survive restarts), then seed the graph, then update all three agent instruction files with task-to-tool trigger tables, then wire Serena + Cloudflare into VS Code.

**Tech Stack:** `@modelcontextprotocol/server-memory`, `mcp-remote`, `uvx`/`serena`, JSON config editing, Markdown.

---

### Task 1: Fix Memory MCP persistence — Claude user config

**Files:**
- Modify: `C:/Users/patij212/.claude.json` (user-scope `memory` server env)

**Step 1: Create the memory directory**

```bash
mkdir -p "C:/Users/patij212/.claude/memory"
```

Expected: directory created (no output).

**Step 2: Update memory server env in Claude config**

Use Python to patch the `mcpServers.memory.env` field at the top-level (user-scope) entry:

```python
import json
path = "C:/Users/patij212/.claude.json"
with open(path) as f:
    data = json.load(f)
data["mcpServers"]["memory"]["env"]["MEMORY_FILE_PATH"] = \
    "C:/Users/patij212/.claude/memory/potfoundry.jsonl"
with open(path, "w") as f:
    json.dump(data, f, indent=2)
print("done")
```

Run: `python3 -c "<above>"`
Expected: `done`

**Step 3: Verify**

```bash
python3 -c "
import json
d = json.load(open('C:/Users/patij212/.claude.json'))
print(d['mcpServers']['memory']['env']['MEMORY_FILE_PATH'])
"
```

Expected: `C:/Users/patij212/.claude/memory/potfoundry.jsonl`

---

### Task 2: Fix Memory MCP persistence — VS Code Insiders config

**Files:**
- Modify: `C:/Users/patij212/AppData/Roaming/Code - Insiders/User/mcp.json`

**Step 1: Add env to memory server entry**

The current entry has no `env` key. Add it:

```json
"memory": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"],
    "env": {
        "MEMORY_FILE_PATH": "C:/Users/patij212/.claude/memory/potfoundry.jsonl"
    }
}
```

Both Claude and VS Code now write to the same file — one shared graph.

**Step 2: Verify the file parses cleanly**

```bash
python3 -c "
import json
d = json.load(open('C:/Users/patij212/AppData/Roaming/Code - Insiders/User/mcp.json'))
print(d['servers']['memory']['env']['MEMORY_FILE_PATH'])
"
```

Expected: `C:/Users/patij212/.claude/memory/potfoundry.jsonl`

---

### Task 3: Add Serena + Cloudflare to VS Code Insiders mcp.json

**Files:**
- Modify: `C:/Users/patij212/AppData/Roaming/Code - Insiders/User/mcp.json`

**Step 1: Verify uvx can find the serena package**

```bash
uvx --from serena serena-mcp-server --help 2>&1 | head -5
```

If the package name is wrong, try `uvx serena --help`. Use whichever works. Add the
working command to the config below.

**Step 2: Add all three servers to the `servers` object**

```json
"serena": {
    "type": "stdio",
    "command": "uvx",
    "args": [
        "--from", "serena",
        "serena-mcp-server",
        "--project-path", "${workspaceFolder}"
    ]
},
"cloudflare-bindings": {
    "type": "stdio",
    "command": "npx",
    "args": ["mcp-remote", "https://bindings.mcp.cloudflare.com/mcp"]
},
"cloudflare-builds": {
    "type": "stdio",
    "command": "npx",
    "args": ["mcp-remote", "https://builds.mcp.cloudflare.com/mcp"]
}
```

**Step 3: Verify the final file parses cleanly**

```bash
python3 -c "
import json
d = json.load(open('C:/Users/patij212/AppData/Roaming/Code - Insiders/User/mcp.json'))
print(list(d['servers'].keys()))
"
```

Expected output includes: `serena`, `cloudflare-bindings`, `cloudflare-builds`, `memory`, `stripe`, `upstash/context7`

---

### Task 4: Seed Memory MCP — Architecture entities

Use `mcp__memory__create_entities` to write the first batch (architecture layer).

Entities to create:

```json
[
  {
    "name": "PotFoundry",
    "entityType": "Project",
    "observations": [
      "TypeScript/React SPA hosted on Cloudflare Pages",
      "Dual WebGPU (primary) / WebGL (fallback) renderer",
      "Auth via Supabase, payments via Stripe, state via Zustand",
      "Active app is potfoundry-web/ — Python module is deprecated",
      "Dev server: cd potfoundry-web && npm run dev (localhost:3000)"
    ]
  },
  {
    "name": "ExportPipeline",
    "entityType": "Architecture",
    "observations": [
      "Four export paths: (1) Legacy CPU useExport.ts, (2) GPU Grid useGPUExport.ts, (3) Adaptive useAdaptiveExport.ts, (4) Parametric useParametricExport.ts",
      "Parametric pipeline is the current best path",
      "Export requires WebGPU — no CPU fallback when renderer fell back to WebGL",
      "Export path is CPU-side to guarantee watertightness — do not blindly rewrite to GPU",
      "Parametric pipeline: 8-stage CPU+GPU hybrid in src/renderers/webgpu/parametric/"
    ]
  },
  {
    "name": "ParametricPipeline",
    "entityType": "Architecture",
    "observations": [
      "Orchestrated by ParametricExportComputer.ts (~1400 lines after modular extraction)",
      "10 sub-modules in src/renderers/webgpu/parametric/ with 259 unit+integration tests",
      "Stage 1: GPU 16-strip curvature sampling (4096 samples/strip)",
      "Stage 2: CPU feature detection — gradient zero-crossings, peak/valley classification",
      "Stage 3: CPU uniform base grid sized to user triangle budget",
      "Stage 4: GPU per-row probing (4096 samples/row) for exact peak/valley U positions",
      "Stage 5: CPU kind-separated chain linking (peaks/valleys linked independently)",
      "Stage 6: CPU chain vertices appended to grid with row-band strip triangulation",
      "Stage 7: GPU re-snap chain vertices to exact GPU positions",
      "Stage 8: GPU evaluate full mesh to 3D positions"
    ]
  },
  {
    "name": "RenderingStack",
    "entityType": "Architecture",
    "observations": [
      "Preview: UI → Zustand → GPU UniformBuffer → Compute Shader → Screen",
      "WebGPURenderer.ts owns the device, swap chain, and frame loop",
      "ShaderManager.ts assembles WGSL programs from raw modules",
      "webgpu_core.ts is a 5500-line monolith — refactor with extreme caution",
      "Renderer selection order: forceRenderer → URL param → localStorage → auto-detect"
    ]
  }
]
```

**Step: Call mcp__memory__create_entities with the above array.**

---

### Task 5: Seed Memory MCP — Irreversible decisions

```json
[
  {
    "name": "NoCDT2D",
    "entityType": "IrreversibleDecision",
    "observations": [
      "cdt2d library removed from parametric pipeline hot path at v11.1",
      "Was O(n²) — 12+ minutes at production scale",
      "Replaced with grid-native O(n) strip triangulation",
      "DO NOT re-add cdt2d to ParametricExportComputer"
    ]
  },
  {
    "name": "NoCDFAdaptiveSpacing",
    "entityType": "IrreversibleDecision",
    "observations": [
      "CDF-adaptive grid spacing removed from parametric pipeline at v16.10",
      "Was causing visible density-band artifacts",
      "Uniform grid + per-row chain patching is the correct architecture"
    ]
  },
  {
    "name": "NoStitchFanVertices",
    "entityType": "IrreversibleDecision",
    "observations": [
      "Stitch fan vertices removed at v16.9",
      "Were creating visible rings around feature edges"
    ]
  },
  {
    "name": "ChainLockBandHalfWidth",
    "entityType": "IrreversibleDecision",
    "observations": [
      "CHAIN_LOCK_BAND_HALF_WIDTH = 1 — DO NOT revert to 0",
      "Lock=0 re-enables the diagonal crease bug",
      "Justification for 0 (stitch fan cleanup) was removed in v16.9"
    ]
  },
  {
    "name": "StyleIDsPermanent",
    "entityType": "IrreversibleDecision",
    "observations": [
      "Style IDs in STYLE_REGISTRY are permanent — serialized into localStorage and GPU geometry buffer",
      "Never renumber existing styles",
      "Use ID >= 20 for new styles",
      "New style order: registry.ts → WGSL shader → geometry/styles.ts → regenerate fixtures"
    ]
  },
  {
    "name": "NoGPUSnapRelax",
    "entityType": "IrreversibleDecision",
    "observations": [
      "GPU snap/relax disabled at v7.2",
      "CPU merge-and-insert replaced the need for GPU vertex movement"
    ]
  }
]
```

**Step: Call mcp__memory__create_entities with the above array.**

---

### Task 6: Seed Memory MCP — Active bugs and key invariants

```json
[
  {
    "name": "ActiveBugs",
    "entityType": "KnownIssues",
    "observations": [
      "53% of outer-wall vertices have valence < 5 — structural from chain-vertex fan topology; needs vertex insertion, not edge flipping",
      "Tall cross-row triangles still present after subdivision pass",
      "Diagonal boundary crease under investigation — regression test: ParametricExportComputer.diagonalConsistency.test.ts",
      "weldMesh.ts string-key dedup crashes browser at large exports (>8k tris) — needs spatial sort welder",
      "Adaptive GPU subdivision creates T-junctions causing cracks in output mesh"
    ]
  },
  {
    "name": "KeyInvariants",
    "entityType": "Invariants",
    "observations": [
      "Supabase client in services/supabase.ts can be null — always call isSupabaseConfigured() before any supabase.* call",
      "ConsolePatch installed in main.tsx BEFORE React mounts — all console.* output intercepted for debug overlay",
      "ESLint 0 max-warnings policy — any warning fails CI and eslint-check.js hook",
      "WGSL vec3<f32> requires 16-byte alignment in compute shader structs — missing padding causes silent export corruption",
      "8k resolution exports create ~500MB arrays — browser tabs will crash",
      "stripShaderCode() removes inactive style functions before GPU upload — only current style WGSL ships to device"
    ]
  },
  {
    "name": "DevWorkflow",
    "entityType": "Workflow",
    "observations": [
      "env-guard.js PreToolUse hook blocks any edit to *.env* files",
      "eslint-check.js PostToolUse hook runs ESLint after every .ts/.tsx edit — fix warnings before moving on",
      "agents_journal.md is append-only multi-agent forum — read last 5-10 entries at session start",
      "E2E tests require running dev server — start npm run dev before npm run test:e2e",
      "Phase 0: query memory MCP search_nodes('potfoundry') before reading journal"
    ]
  }
]
```

**Step: Call mcp__memory__create_entities with the above array.**

---

### Task 7: Add MCP Tools section to CLAUDE.md

**Files:**
- Modify: `potfoundry-web/CLAUDE.md` — insert after the `## Commands` section (after line ~20)

**Step: Insert the following block after the closing ``` of the Commands section:**

```markdown
## MCP Tools

> Query `memory` MCP at session start before reading the journal — it contains distilled
> project knowledge that may make full journal reads unnecessary.

Use these trigger mappings to reach for the right tool instead of using code paths as proxies:

| Task | Use this MCP | Instead of |
|---|---|---|
| Check or update user subscription tier | `stripe` | reading `services/stripe.ts` |
| Query auth records, export counts, Supabase RPC | `supabase` | guessing SQL structure |
| Check if a Cloudflare Pages deploy succeeded | `cloudflare-builds` | reading build_log.txt |
| Manage Workers KV / D1 / R2 bindings | `cloudflare-bindings` | wrangler CLI guesswork |
| Look up React / Three.js / Radix / Zustand API | `context7` | hallucinating APIs |
| Run or debug E2E tests in a real browser | `playwright` | describing expected behaviour |
| Check open issues or PR status | `github` | asking the user |
| Recall decisions from previous sessions | `memory` | re-reading the whole journal |
| Navigate symbols or find all references | `serena` | broad file grepping |
```

---

### Task 8: Add Phase 0 + MCP Toolbox to agents.md

**Files:**
- Modify: `agents.md` (root of repo)

**Step 1: Insert Phase 0 before Phase 1 in the AGENT LIFECYCLE section**

Insert after the `## 🔄 AGENT LIFECYCLE (The Protocol)` heading and before the `### Phase 1:` heading:

```markdown
### Phase 0: MCP Orientation (< 2 min)
*   **Query memory**: `search_nodes("potfoundry")` → loads distilled project knowledge.
*   **If memory has results**: skip journal reads for facts already covered — go straight to Phase 2.
*   **If memory is empty**: proceed to Phase 1 as normal.
```

**Step 2: Append MCP Toolbox section after Section 5**

Append after the `## 5. ⚠️ Known Bottlenecks & Tribal Knowledge` section and before `## 6. 📅 Active Roadmap`:

```markdown
## 5b. 🔌 MCP Toolbox (All Agents)

These tools are available to all MCP-compatible agents in this project.
Reach for them instead of guessing or reading code as a proxy.

| Task | Tool |
|---|---|
| Live API docs for any library (React, Three.js, Pydantic, etc.) | `context7` |
| Database queries / Supabase RPC / auth records | `supabase` |
| Run or inspect E2E tests in a real browser | `playwright` |
| Check PR status, open issues, CI runs | `github` |
| Recall decisions and facts from previous sessions | `memory` |
```

---

### Task 9: Overhaul copilot-instructions.md

**Files:**
- Modify: `.github/copilot-instructions.md` (full replacement — Python app is deprecated)

**Step: Replace the entire file with the following:**

```markdown
# Copilot Instructions for PotFoundry

## Project Overview

PotFoundry is a parametric 3D pottery design tool — TypeScript/React SPA on Cloudflare Pages.
It generates high-fidelity, watertight STL and 3MF meshes for 3D printing, with a dual
WebGPU (primary) / WebGL (fallback) renderer and real-time WGSL shader preview.

**Key features:**
- 19 parametric styles with real-time WebGPU preview
- 4 export paths (parametric pipeline is current best)
- Auth via Supabase, payments via Stripe, state via Zustand
- Cloudflare Pages deployment with Wrangler edge functions

**The Python module (`potfoundry/`) is deprecated** — it is mathematical reference only.
All active work is in `potfoundry-web/`.

---

## Architecture

### Data flows
- **Preview**: `UI` → `Zustand` → `GPU UniformBuffer` → `WGSL Compute Shader` → `Screen`
- **Export**: `UI` → `Worker Thread` → `ParametricExportComputer.ts` → `Binary STL` → `Disk`

### Key directories
```
potfoundry-web/src/
  renderers/webgpu/          # WebGPU renderer + WGSL shaders
    parametric/              # 10-module parametric export pipeline
  state/                     # Zustand slices (geometry, style, mesh, ui, appearance)
  services/supabase.ts       # Supabase client (may be null — check isSupabaseConfigured())
  services/stripe.ts         # Price IDs + tier feature config
  styles/registry.ts         # Single source of truth for all style IDs and params
  ui/                        # React components
  utils/geometry/            # CDT triangulation, mesh stitching, chain constraints
```

---

## Coding Standards

- **TypeScript strict** — no `any`, use `unknown` or define an interface
- **JSDoc required** for all exported functions
- **ESLint 0 max-warnings** — any warning fails CI
- **Immutability** — prefer `const` and spread operators
- **Named selector hooks** — use `useGeometry()`, `useStyle()` etc., not raw `useAppStore()`
- **No magic numbers** — extract to `constants.ts` with a comment explaining the value

---

## Testing

```bash
cd potfoundry-web
npm test                  # Vitest unit tests
npm run test:coverage     # Vitest + v8 coverage
npm run test:e2e          # Playwright E2E (requires dev server running first)
npm run dev               # Start dev server before E2E
npm run lint              # ESLint — must be clean before committing
npm run typecheck         # tsc --noEmit
```

Tests live alongside source files as `*.test.ts` / `*.test.tsx`.
E2E specs live in `e2e/`.

---

## Git Workflow

Conventional commit format: `<type>: <short summary>`

Types: `feat` `fix` `docs` `refactor` `perf` `test` `chore`

PR checklist:
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` clean (0 warnings)
- [ ] `npm test` passes
- [ ] No new `any` types introduced
- [ ] Style IDs not renumbered (they are permanent)

---

## MCP Tools Available

> Query `memory` MCP before reading `ARCHITECTURE.md` — it may already contain what you need.

| Task | Tool |
|---|---|
| Check or update user subscription tier | `stripe` |
| Query auth records, export counts, Supabase RPC | `supabase` |
| Check Cloudflare Pages deploy status | `cloudflare-builds` |
| Manage Workers KV / D1 / R2 bindings | `cloudflare-bindings` |
| Look up React / Three.js / Radix / Zustand API docs | `context7` |
| Run or debug E2E tests in a real browser | `playwright` |
| Check open issues or PR status | `github` |
| Recall decisions from previous sessions | `memory` |
| Navigate symbols or find all references | `serena` |

---

## Key Gotchas

- **Supabase client can be null** — always call `isSupabaseConfigured()` before any `supabase.*` call
- **Style IDs are permanent** — serialized into localStorage and GPU buffers; never renumber
- **Export requires WebGPU** — no CPU fallback when renderer fell back to WebGL
- **WGSL vec3<f32> needs 16-byte alignment** — missing padding causes silent data corruption
- **webgpu_core.ts is 5500 lines** — refactor with extreme caution
- **ConsolePatch intercepts all console.*** — installed in `main.tsx` before React mounts

---

## Working with LLMs

1. Query `memory` MCP first — it holds distilled project knowledge across sessions
2. Reference `potfoundry-web/CLAUDE.md` for exhaustive architecture and pipeline details
3. Read `agents_journal.md` for recent agent decisions and open investigations
4. Make minimal, focused changes — avoid refactoring code you weren't asked to touch
5. Fix ESLint warnings before finishing — they will fail CI
```

---

### Task 10: Verify everything

**Step 1: Confirm memory graph has entities**

Call `mcp__memory__read_graph` and verify entities list is non-empty.

**Step 2: Confirm CLAUDE.md has MCP section**

```bash
grep -n "MCP Tools" potfoundry-web/CLAUDE.md
```

Expected: line number printed.

**Step 3: Confirm agents.md has Phase 0**

```bash
grep -n "Phase 0" agents.md
```

Expected: line number printed.

**Step 4: Confirm copilot-instructions.md no longer mentions Streamlit**

```bash
grep -i "streamlit\|pydantic\|pytest\|potfoundry/geometry" .github/copilot-instructions.md
```

Expected: no output (all Python references removed).

**Step 5: Confirm VS Code mcp.json has all servers**

```bash
python3 -c "
import json
d = json.load(open('C:/Users/patij212/AppData/Roaming/Code - Insiders/User/mcp.json'))
print(sorted(d['servers'].keys()))
"
```

Expected: `cloudflare-bindings`, `cloudflare-builds`, `memory`, `serena`, `stripe`, and context7 entries.

---

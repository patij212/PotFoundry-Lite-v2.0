# Copilot Instructions for PotFoundry

## Project Overview

PotFoundry is a parametric 3D pottery design tool — TypeScript/React SPA on Cloudflare Pages.
Dual WebGPU/WebGL renderer, real-time WGSL shader preview, watertight STL/3MF export for 3D printing.

> **Active code**: `potfoundry-web/`. Python module (`potfoundry/`) is reference math only.

---

## Coding Standards

- **TypeScript strict** — no `any`, use `unknown` or define an interface
- **JSDoc required** for all exported functions
- **ESLint 0 max-warnings** — any warning fails CI
- **Immutability** — prefer `const` and spread operators
- **Named selector hooks** — use `useGeometry()`, `useStyle()` etc., not raw `useAppStore()`
- **No magic numbers** — extract to `constants.ts` with a comment

---

## Commands

```bash
cd potfoundry-web
npm run dev           # Dev server
npm test              # Vitest unit tests
npm run lint          # ESLint — must be clean
npm run typecheck     # tsc --noEmit
npm run test:e2e      # Playwright E2E (start dev server first)
```

---

## Git Workflow

Conventional commits: `feat:` `fix:` `docs:` `refactor:` `perf:` `test:` `chore:`

PR checklist: typecheck passes, lint clean, tests pass, no new `any`, style IDs not renumbered.

---

## Key Gotchas

- **Supabase client can be null** — always call `isSupabaseConfigured()` first
- **Style IDs are permanent** — never renumber; use ID ≥ 20 for new styles
- **WGSL `vec3<f32>` needs 16-byte alignment** — missing padding = silent data corruption
- **`webgpu_core.ts` is 5500+ lines** — refactor with extreme caution
- **ESLint hook fires after every `.ts`/`.tsx` edit** — fix warnings before moving on

---

## Deep Context (Read When Needed)

For parametric pipeline work, architecture, or debugging:
- **`docs/AGENT_CONTEXT_DISTILLED.md`** — Deep engineering knowledge, bug patterns, constants
- **`potfoundry-web/CLAUDE.md`** — File-level architecture, export paths, dev hooks
- **`agents.md`** — Multi-agent workflow protocol
- **`agents_journal.md`** — Recent agent session notes (read last 3-5 entries)

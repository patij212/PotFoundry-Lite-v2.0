# AGENTS.MD — Agent Protocol

> This file defines the **workflow protocol** for AI agents working on PotFoundry.
> For engineering knowledge, read `docs/AGENT_CONTEXT_DISTILLED.md`.
> For coding standards and commands, see `.github/copilot-instructions.md`.

---

## Quick Start

- **Active app**: `potfoundry-web/` (TypeScript/React/WebGPU SPA)
- **Dev server**: `cd potfoundry-web && npm run dev`
- **Tests**: `cd potfoundry-web && npm test`
- **Python module** (`potfoundry/`): reference math only, not active product

---

## Agent Lifecycle

### Phase 0: Orientation
1. Read `docs/AGENT_CONTEXT_DISTILLED.md` (deep engineering knowledge)
2. Check `TODO.md` and `ROADMAP.md` for current priorities
3. Read last 3-5 entries of `agents_journal.md` only if you need recent chronology

### Phase 1: Execution
- Work on the requested task
- Use `agents_journal.md` as a scratchpad (hypotheses, observations, notes to other agents)
- **APPEND only** — never delete or modify previous journal entries

### Phase 2: Sign-off (Mandatory)
Write a sign-off entry in `agents_journal.md` with:
1. **Summary**: What you implemented and why
2. **Decisions**: Key choices made (with rationale)
3. **Validation**: What you tested (`typecheck`, `lint`, `test`)
4. **Risks**: What might break, open questions
5. **Next agent**: What the next agent should know

### Journal Rules
- Target 15-40 lines per entry
- Deep narratives go in `archive/plans/`, linked from journal
- If an entry exceeds ~120 lines, split into a plan doc

---

## Multi-Agent Debate Protocol (Pipeline Work)

For complex parametric pipeline changes, use the 4-agent debate cycle:

1. **Generator** proposes a solution (creative, aggressive, mathematically grounded)
2. **Verifier** attacks the proposal (rigorous, evidence-driven, must cite code)
3. **Executioner** reviews feasibility (production TypeScript, implementation cost)
4. **Master** approves or rejects (architectural alignment, regression safety)

**Rules**:
- Nothing ships without unanimous agreement from all four agents
- Max 10 debate rounds before Master intervenes with a directive
- Generator must trace code paths, not just reason abstractly
- Verifier rejections must include a path to ACCEPT
- Documents go in `archive/plans/` (see `archive/plans/INDEX.md` for structure)

---

## Before Any Handoff

```bash
cd potfoundry-web
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint — must be 0 warnings
npm test             # Vitest unit tests
```

---

## File Map (What to Read When)

| You need... | Read this |
|---|---|
| Deep engineering knowledge, bug patterns, constants | `docs/AGENT_CONTEXT_DISTILLED.md` |
| Coding standards, commands, git workflow | `.github/copilot-instructions.md` |
| File-level architecture, export paths, dev hooks | `potfoundry-web/CLAUDE.md` |
| Current priorities | `TODO.md` + `ROADMAP.md` |
| Recent agent activity | Last 3-5 entries of `agents_journal.md` |
| Detailed web architecture (diagrams) | `potfoundry-web/ARCHITECTURE.md` |

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **PotFoundry-Lite-v2.0** (30318 symbols, 43496 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/PotFoundry-Lite-v2.0/context` | Codebase overview, check index freshness |
| `gitnexus://repo/PotFoundry-Lite-v2.0/clusters` | All functional areas |
| `gitnexus://repo/PotFoundry-Lite-v2.0/processes` | All execution flows |
| `gitnexus://repo/PotFoundry-Lite-v2.0/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

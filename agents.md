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

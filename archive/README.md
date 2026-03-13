# PotFoundry Archive

Historical documents from PotFoundry's development, preserved for reference and traceability.
Not actively maintained — for current docs see the main repository.

Last reorganized: 2026-03-11

## Directory Structure

| Directory | Contents | When to consult |
|-----------|----------|-----------------|
| `plans/` | 296 multi-agent debate documents (Generator/Verifier/Executioner/Master) | Deep-dive on pipeline, UI, or WebGPU design decisions |
| `agent-journals/` | Pre-distillation journal snapshots (~11K lines total) | Forensic chronology of development sessions |
| `artifacts/` | Playwright captures, pytest outputs, benchmark data, streamlit logs | Debugging similar issues, performance baselines |
| `docs/` | Superseded strategy docs, stale roadmaps, completed audits, Python-era guides | Understanding past approaches |
| `evolution/` | Quality improvement summaries, progress reports | Tracking project quality over time |
| `ci-logs/` | GitHub Actions logs, historical build outputs | Debugging CI/CD issues |
| `refactoring/` | Linting/type-checking outputs from improvement work | Code quality evolution |
| `cleanup/` | Stale root configs (`.eslintrc.cjs`, `.yamllint`), one-off debug scripts (`test_camera_mapping.js`) | Past cleanup operations |
| `debug_scripts/` | One-off investigation scripts | Debugging methodology reference |
| `legacy_app/` | Old Streamlit app code | Understanding original application |
| `legacy_python/` | Deprecated Python modules, migration tools, Streamlit config | Mathematical reference, algorithm origins |
| `reference_snippets/` | Useful code snippets from past work | Implementation patterns |
| `workflows/` | Python-era GitHub Actions workflows (10 files + CI helper script) | Understanding past CI/CD setup |

### Plans (296 docs, ~5MB) — `plans/`

Organized by workstream with a detailed navigation index at `plans/INDEX.md`:

| Subdirectory | Files | Topic |
|---|---|---|
| `parametric-pipeline/` | 220 | Chain linking, tessellation, CDT, grid, feature detection, mesh quality (R1–R55+) |
| `ui-redesign/` | 32 | UI v2 layout, responsive theme, component phases 1–3 |
| `webgpu-refactor/` | 28 | WebGPU core decomposition, buffer layout, type safety |
| `misc/` | 16 | OBJ export, code quality, known issues, MCP guidance |

Key knowledge from these docs has been **distilled** into `docs/AGENT_CONTEXT_DISTILLED.md`.

## Usage Guidelines

- Archive documents show project evolution but may contain outdated information
- Always verify against current docs (`docs/AGENT_CONTEXT_DISTILLED.md`, `CLAUDE.md`, etc.)
- Use archive to understand **why** decisions were made, not **what** to do now
- The `plans/INDEX.md` file is your entry point for finding specific debate topics
3. They contain information not available elsewhere

## Quarterly Archive Process

At the end of each quarter, maintainers should:
1. Review root-level markdown files
2. Identify completed status reports and summaries
3. Move to appropriate archive subdirectory (e.g., `evolution/2025-q1/`)
4. Update this README with any significant additions
5. Create a quarter-specific README if needed

---

**Last Updated:** March 2026
**Maintained By:** PotFoundry Team
**Contact:** See main README.md for current contact information

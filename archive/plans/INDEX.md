# Plan Documents Archive — Navigation Index

> **296 multi-agent debate documents** from PotFoundry's development history,
> organized by workstream for traceability.
>
> Key knowledge has been distilled into `docs/AGENT_CONTEXT_DISTILLED.md`.
> These originals are preserved for forensic reference and detailed context.

Archived: 2026-03-11

---

## Directory Structure

| Directory | Files | Description |
|-----------|------:|-------------|
| `parametric-pipeline/` | 220 | Chain linking, tessellation, CDT, grid construction, feature detection, mesh quality — rounds R1–R55+ |
| `ui-redesign/` | 32 | UI v2 layout system, responsive theme, component phases 1–3, settings, animations |
| `webgpu-refactor/` | 28 | WebGPU core decomposition (phases 3f–7), `as any` elimination, buffer layout, camera controller |
| `misc/` | 16 | OBJ export, code quality (r46 cleanup), known issues audits, MCP guidance, master journal |

---

## How to Find Things

### By Round Number
Pipeline rounds (R1–R55) have docs from multiple agents per round:
- `generator-round-N-*.md` — Proposal
- `verifier-round-N-*.md` — Critique
- `executioner-round-N-*.md` or `executioner-review-RN-*.md` — Feasibility review
- `master-approval-*round-N*.md` or `master-approval-RN-*.md` — Approval/rejection

### By Topic
| Topic | Key Files (in `parametric-pipeline/`) |
|-------|-------|
| Chain linking & DP | `*round-11*`, `*round-12*`, `*chain-linking*`, `*chain-jaggedness*` |
| Chain smoothing (WH) | `*round-7-smoothing*`, `*round-8-polyline*`, `*round-9-smooth*` |
| Feature detection | `*round-10-exact-feature*`, `*round-15-catrom*`, `*chain-position-accuracy*` |
| CDT / tessellation | `*round-3-tessellation*`, `*cdt-*`, `*companion*`, `*chain-strip*` |
| Grid construction (CAG) | `*round-18*grid*`, `*round-19-density*`, `*round-22*grid*` |
| D-Radical promotion | `*round-18.1*`, `*round-23-promo*`, `*round-24*boundary*` |
| Companions / T-ladder | `*round-4-2d-companion*`, `*round-5-companion*`, `*round-25-companion*` |
| Edge collapse / quality | `*edge-collapse*`, `*anisotropic*`, `*valence3*` |
| Seam problem | `*seam*`, `*round-17*`, `*round-32-boundary*` |
| Cell fusion / R54 | `*R54*`, `*round-34*`, `*round-35-super-cell*`, `*round-36*` |
| Chain birth/death | `*round-51*birth-death*` |
| Ridge distance / dips | `*round-37*dip*`, `*round-39*dip*`, `*round-47*topology*`, `*round-50*` |

### By Date
Dated docs (`2026-MM-DD-*.md`) capture session-level work spanning multiple topics.
Most are in `parametric-pipeline/`; UI-specific dated docs are in `ui-redesign/`.

### By Agent Role
- **Generator** (`generator-*`): Creative proposals, divergent thinking
- **Verifier** (`verifier-*`): Adversarial critique, mathematical validation
- **Executioner** (`executioner-*`): Implementation feasibility, production code review
- **Master** (`master-*`): Approvals, directives, strategic decisions

---

## Key Milestone Documents

| Milestone | File | Location |
|-----------|------|----------|
| Original pipeline audit | `generator-round-1-parametric-pipeline-audit.md` | pipeline |
| Non-crossing DP adoption | `generator-round-12-non-crossing-chain-linking.md` | pipeline |
| D-Radical chain promotion | `generator-round-18.1-revised-grid-bleeding.md` | pipeline |
| Companion cloud redesign | `generator-round-5-companion-redesign.md` | pipeline |
| CDF-adaptive grid (CAG) | `generator-round-19-density-grading.md` | pipeline |
| Final team audit | `2026-03-07-parametric-pipeline-team-audit-FINAL.md` | pipeline |
| UI v2 spec | `2026-03-06-ui-v2-consolidated-spec.md` | ui-redesign |
| WebGPU decomposition plan | `generator-round-1-webgpu-core-decomposition.md` | webgpu-refactor |

# Development Guide

> Development setup and workflows for the **potfoundry-web** application.

---

## Prerequisites

- Node.js 18+
- npm
- Modern browser with WebGPU support (Chrome 113+, Edge 113+, Firefox Nightly)

## Quick Start

```bash
cd potfoundry-web
npm install
npm run dev
```

Opens at **http://localhost:5173/**

## Development Commands

```bash
npm run dev         # Start dev server with HMR
npm run build       # Production build to dist/
npm run preview     # Preview production build
npm run lint        # ESLint (0 max-warnings)
npm run typecheck   # tsc --noEmit
npm run format      # Prettier
npm test            # Vitest unit tests
npm run test:e2e    # Playwright E2E (start dev server first)
```

## Git Workflow

Conventional commits: `feat:` `fix:` `docs:` `refactor:` `perf:` `test:` `chore:`

```bash
git checkout -b feature/your-feature-name
# ... make changes ...
cd potfoundry-web
npm run typecheck && npm run lint && npm test
git add <files>
git commit -m "feat: add elliptical cross-sections"
git push origin feature/your-feature-name
```

## Pre-commit Hooks & Secret Scanning

This repository uses `pre-commit` plus `detect-secrets` to prevent accidental commits of sensitive material.

### Setup

```bash
pip install pre-commit detect-secrets
pre-commit install --install-hooks
```

### Supabase Service Role Key Protection

A custom hook (`scripts/precommit_forbid_service_role.sh`) scans staged files for `srv-*` tokens. If triggered:

1. Remove the secret immediately
2. Rotate it in Supabase
3. Amend the commit after scrubbing

### Updating detect-secrets baseline

```bash
detect-secrets scan > detect-secrets.baseline.new
mv detect-secrets.baseline.new detect-secrets.baseline
git add detect-secrets.baseline
```

## Key Documentation

| Topic | File |
|-------|------|
| Architecture (web app) | `potfoundry-web/ARCHITECTURE.md` |
| Coding standards | `.github/copilot-instructions.md` |
| Contributing | `CONTRIBUTING.md` |
| Adding styles | `potfoundry-web/docs/adding_new_styles.md` |
| STL pipeline | `potfoundry-web/docs/STL_FIDELITY_REVIEW.md` |
| Deep engineering context | `docs/AGENT_CONTEXT_DISTILLED.md` |

---

**Last Updated:** March 2026

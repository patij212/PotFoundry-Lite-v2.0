# Contributing to PotFoundry

Thanks for your interest in contributing! This guide explains how to propose changes and keep quality high.

## Development Setup

- Node.js 18+
- Modern browser with WebGPU support (Chrome 113+, Edge 113+, Firefox Nightly)

```bash
cd potfoundry-web
npm install
npm run dev          # Dev server at http://localhost:5173/
```

## Coding Standards

- **TypeScript strict** — no `any`, use `unknown` or define an interface
- **JSDoc required** for all exported functions
- **ESLint 0 max-warnings** — any warning fails CI
- **Immutability** — prefer `const` and spread operators
- **Named selector hooks** — use `useGeometry()`, `useStyle()` etc., not raw `useAppStore()`
- **No magic numbers** — extract to `constants.ts` with a comment
- **Style IDs are permanent** — never renumber; use ID >= 20 for new styles

See `.github/copilot-instructions.md` for the full coding standards.

## Making Changes

1. Create a feature branch from the default branch
2. Write tests (unit/integration/regression) for your change
3. Implement changes with clear, well-documented code
4. Update docs if behavior or APIs change

## Pull Request Checklist

```bash
cd potfoundry-web
npm run typecheck    # tsc --noEmit — must pass
npm run lint         # ESLint — must be 0 warnings
npm test             # Vitest unit tests — must pass
```

- [ ] All three checks above pass (CI runs these automatically on every PR)
- [ ] No new `any` types introduced
- [ ] Style IDs not renumbered
- [ ] Docs updated (if needed)
- [ ] PR description includes motivation and context
- [ ] Conventional commit format: `feat:` `fix:` `docs:` `refactor:` `perf:` `test:` `chore:`

## Review Process

- Expect actionable feedback focused on correctness, clarity, and performance
- Address comments via follow-up commits
- Squash commits if requested to keep history clean

## Security & Secrets

- **Supabase client can be null** — always call `isSupabaseConfigured()` first
- Do not commit any secrets — pre-commit hooks scan for service role keys
- If a secret is accidentally committed, rotate it immediately and notify maintainers

## Reporting Issues

- Include steps to reproduce, expected vs actual behavior, and environment details
- Attach logs or screenshots when helpful

## License

- Non-commercial use under PolyForm Noncommercial 1.0.0
- Contact maintainers for commercial licensing

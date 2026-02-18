---
name: run-checks
description: Run the full pre-commit quality gate for PotFoundry — TypeScript typecheck, ESLint (0 warnings), and Vitest unit tests — in sequence. Stops and reports on first failure.
disable-model-invocation: true
---

Run the following commands in sequence from the project root. Stop at the first failure and report the full output of the failing step.

**Step 1 — TypeScript:**
```
npm run typecheck
```

**Step 2 — ESLint (0 max-warnings):**
```
npm run lint
```

**Step 3 — Unit tests:**
```
npm run test
```

If all three pass, report: "✓ typecheck, lint, and tests all passed — safe to commit."

If any step fails, report which step failed, include the full error output, and stop. Do not run subsequent steps after a failure.

# Contributing to PotFoundry

Thanks for your interest in contributing! This guide explains how to propose changes and keep quality high.

## Development Setup

- Python 3.11+
- Create a virtual environment and install dependencies:
  - `pip install -r requirements.txt`
  - `pip install -r requirements-dev.txt` (optional dev extras)
- Run tests to verify baseline:
  - `PYTHONPATH=. pytest -v`

## Coding Standards

- Follow `docs/guides/CODE_QUALITY_GUIDE.md` and `docs/guides/TYPE_HINTS_GUIDE.md`
- Type hints required on all functions
- Google-style docstrings for all public functions
- Keep functions small and focused; prefer NumPy vectorization

## Making Changes

1. Create a feature branch from the default branch
2. Write tests (unit/integration/regression) for your change
3. Implement changes with clear, well-documented code
4. Update docs if behavior or APIs change

## Pull Request Checklist

- [ ] Tests pass: `PYTHONPATH=. pytest -v`
- [ ] Lint clean: `ruff check .`
- [ ] Type check clean: `mypy` (if applicable)
- [ ] Docs updated (if needed)
- [ ] No performance regressions
- [ ] PR description includes motivation and context

## Review Process

- Expect actionable feedback focused on correctness, clarity, and performance
- Address comments via follow-up commits
- Squash commits if requested to keep history clean

## Security & Secrets

- Do not commit any secrets. We use pre-commit and detect-secrets to scan staged files
- If a secret is accidentally committed, rotate it immediately and notify maintainers

## Reporting Issues

- Include steps to reproduce, expected vs actual behavior, and environment details
- Attach logs or screenshots when helpful

## License

- Non-commercial use under PolyForm Noncommercial 1.0.0
- Contact maintainers for commercial licensing

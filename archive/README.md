# PotFoundry Archive

This directory contains historical documents from the evolution of PotFoundry-Lite v2.x.
These files are preserved for reference but are not actively maintained.

## Purpose

The archive preserves context for past development decisions, progress tracking, and
improvement efforts. This helps:
- Understand why certain decisions were made
- Track project evolution over time
- Reference past approaches to similar problems
- Maintain institutional knowledge

## Directory Structure

### `evolution/`
Historical improvement summaries and progress reports from major development phases.

**Contents:**
- Quality improvement summaries
- Test coverage reports
- Implementation summaries
- Progress tracking documents

**When to consult:**
- Understanding past quality improvement efforts
- Reviewing historical test coverage progress
- Learning about past implementation challenges

### `ci-logs/`
Historical CI/CD run logs and workflow outputs.

**Contents:**
- GitHub Actions run logs
- Historical pytest outputs
- Build and deployment logs

**When to consult:**
- Debugging similar CI/CD issues
- Understanding past build failures
- Historical performance tracking

### `refactoring/`
Linting and type-checking output from improvement work.

**Contents:**
- `linting/` - ruff, flake8, pylint outputs
- `type-checking/` - mypy outputs and error reports

**When to consult:**
- Understanding code quality evolution
- Reviewing type hint additions
- Learning from past linting fixes

## Usage Guidelines

### For Developers
- These documents provide historical context but should not be used as current guides
- For current development information, see the main repository documentation:
  - README.md (project overview)
  - ARCHITECTURE.md (system design)
  - docs/guides/ (current development guides)

### For AI Assistants
- Archive documents show project evolution but may contain outdated information
- Always verify information against current documentation
- Use archive to understand "why" decisions were made, not "what" to do now

## Document Lifecycle

Documents move to archive when:
1. A new version supersedes them
2. The reported status is complete and historical
3. The information is no longer actively maintained
4. The document is primarily of historical interest

Documents should NOT be in archive if:
1. They describe current active work
2. They are referenced by active development processes
3. They contain information not available elsewhere

## Quarterly Archive Process

At the end of each quarter, maintainers should:
1. Review root-level markdown files
2. Identify completed status reports and summaries
3. Move to appropriate archive subdirectory (e.g., `evolution/2025-q1/`)
4. Update this README with any significant additions
5. Create a quarter-specific README if needed

---

**Last Updated:** January 2025
**Maintained By:** PotFoundry Team
**Contact:** See main README.md for current contact information

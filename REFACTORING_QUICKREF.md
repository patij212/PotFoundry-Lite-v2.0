# Repository Refactoring - Quick Reference

**For:** Fast reference during implementation
**See Also:** [REFACTORING_INDEX.md](REFACTORING_INDEX.md) for full navigation

---

## Quick Start

### Phase 1 Execution (READY NOW)
```bash
# 1. Create archive structure
mkdir -p archive/{evolution/2024-q4,ci-logs/2024-q4,refactoring/{linting,type-checking}}

# 2. Move historical documents
# See MIGRATION_GUIDE_PHASE1.md Section "Step 1" for exact commands

# 3. Update .gitignore
# See MIGRATION_GUIDE_PHASE1.md Section "Step 6" for new entries

# 4. Verify
PYTHONPATH=. pytest -v  # All tests should pass

# 5. Commit
git add -A
git commit -m "refactor: Phase 1 - Documentation cleanup"
```

**Full Guide:** [MIGRATION_GUIDE_PHASE1.md](MIGRATION_GUIDE_PHASE1.md)

---

## Key Files

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **REFACTORING_EXECUTIVE_SUMMARY.md** | Stakeholder overview | Start here (5 min read) |
| **REFACTORING_INDEX.md** | Central navigation | Reference hub |
| **REFACTORING_PLAN.md** | Detailed strategy | Deep understanding |
| **REFACTORING_ANALYSIS.md** | Decision rationale | Understanding "why" |
| **MIGRATION_GUIDE_PHASE1.md** | Step-by-step Phase 1 | During execution |

---

## Phases at a Glance

| Phase | Effort | Risk | Status | Priority |
|-------|--------|------|--------|----------|
| **1. Documentation** | 2-3h | Low | ✅ Ready | ⭐ Critical |
| **2. Code Structure** | 8-12h | Med | Planned | High |
| **3. Components** | 6-8h | Med | Planned | Medium |
| **4. Testing** | 4-6h | Low | Planned | High |
| **5. CI/CD** | 3-4h | Low | Planned | High |

**Total:** 27-38 hours over 4-6 weeks

---

## Current State (Before Refactoring)

```
Root: 58 files
  ├─ 33 .md files (many historical)
  ├─ 25+ .log/.txt files (temporary)
  └─ Essential docs mixed with clutter

Large Files:
  ├─ app.py: 3015 LOC
  ├─ pfui/schemas.py: 2335 LOC
  └─ pfui/preview.py: 1141 LOC

Tests: Flat structure (40+ files)
CI/CD: None
```

## Target State (After Refactoring)

```
Root: ~20 essential files
  ├─ Core docs (README, ARCHITECTURE, etc.)
  ├─ Config files
  └─ archive/ for historical docs

Modular Code:
  ├─ app.py: ~500 LOC
  ├─ pfui/schemas/: 5-7 files (~800 LOC)
  └─ pfui/preview/: 4-5 files (~600 LOC)

Tests: Organized by type
CI/CD: Automated workflows
```

---

## Success Criteria

### Phase 1
- [ ] Root ≤20 files
- [ ] Archive structure complete
- [ ] All tests passing (99+)

### Overall
- [ ] No file >1000 LOC
- [ ] Test coverage ≥95%
- [ ] CI/CD operational
- [ ] Documentation organized

---

## Emergency Procedures

### Rollback
```bash
# Before commit
git reset --hard HEAD

# After commit
git revert HEAD

# Full rollback
git checkout backup-pre-refactoring
```

### Validation
```bash
# Tests pass?
PYTHONPATH=. pytest -v

# App works?
streamlit run app.py

# Linting clean?
ruff check .
```

---

## Common Commands

### File Management
```bash
# Move to archive
mv FILE.md archive/evolution/2024-q4/

# Delete temporary
rm -f tmp_*.py *.log

# Create directory
mkdir -p path/to/dir
```

### Git Operations
```bash
# Status
git status

# Stage all
git add -A

# Commit
git commit -m "refactor: Phase X - Description"

# Tag
git tag pre-phase-2

# Push
git push origin feature/branch
```

### Testing
```bash
# All tests
PYTHONPATH=. pytest -v

# Specific test
PYTHONPATH=. pytest tests/test_file.py -v

# With coverage
PYTHONPATH=. pytest --cov=potfoundry --cov=pfui tests/
```

---

## Helpful Snippets

### Count Files
```bash
# Root markdown files
ls *.md | wc -l

# All log files
find . -name "*.log" | wc -l

# Archive files
find archive/ -type f | wc -l
```

### Find Large Files
```bash
# Files >1000 LOC
find . -name "*.py" -exec wc -l {} \; | awk '$1 > 1000'

# Directory sizes
du -sh */
```

### Verify Changes
```bash
# What changed?
git status

# Detailed diff
git diff --stat

# Files to commit
git diff --cached --name-only
```

---

## Contact & Help

### Questions?
- See [REFACTORING_INDEX.md](REFACTORING_INDEX.md) for navigation
- See specific guide for detailed steps
- Create GitHub Discussion for clarification

### Issues During Execution?
- Check MIGRATION_GUIDE_PHASE1.md "Troubleshooting" section
- Use rollback procedures if needed
- Document unexpected issues for future reference

---

**Document Version:** 1.0
**Last Updated:** January 2025
**Status:** Reference Guide
**Audience:** Implementation team

*This is a quick reference. Always refer to detailed guides for complete instructions.*
